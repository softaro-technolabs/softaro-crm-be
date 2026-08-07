import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import * as ExcelJS from 'exceljs';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { attendanceRecords, userTenants, users } from '../database/schema';
import { AttendanceReportQueryDto } from './attendance.dto';
import { AttendanceService, type AttendanceActor } from './attendance.service';
import { PaginationUtil } from '../common/utils/pagination.util';
import { countDaysInclusive, eachDateInRange, isValidDateStr, monthRange } from './attendance.util';

/** One agent's totals across the reporting window. */
export interface AttendanceReportRow {
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  holidayDays: number;
  weekOffDays: number;
  lateDays: number;
  /** Days with any recorded work — the denominator people actually care about. */
  workedDays: number;
  totalWorkingMinutes: number;
  totalWorkingHours: string;
  avgWorkingHours: string;
  overtimeMinutes: number;
  overtimeHours: string;
  totalLateMinutes: number;
  /** Present + half-day (weighted 0.5) over payable days, as a percentage. */
  attendancePercentage: number;
  firstCheckInDate: string | null;
  lastCheckInDate: string | null;
}

@Injectable()
export class AttendanceReportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly attendanceService: AttendanceService,
  ) {}

  /** Attendance reporting exposes the whole team, so it is admin-only. */
  private assertAdmin(actor: AttendanceActor): void {
    if (!actor.isAdmin) {
      throw new ForbiddenException('You do not have permission to view attendance reports');
    }
  }

  /**
   * Resolves the reporting window.
   * `month` wins over an explicit range; otherwise the range defaults to
   * month-to-date in the tenant's own timezone.
   */
  private async resolveRange(
    tenantId: string,
    query: AttendanceReportQueryDto,
  ): Promise<{ startDate: string; endDate: string }> {
    if (query.month) {
      try {
        return monthRange(query.month);
      } catch {
        throw new BadRequestException('month must be in YYYY-MM format');
      }
    }

    const settings = await this.attendanceService.getSettings(tenantId);
    const today = this.attendanceService.todayFor(settings);

    const startDate = query.startDate ?? `${today.slice(0, 7)}-01`;
    const endDate = query.endDate ?? today;

    if (!isValidDateStr(startDate)) {
      throw new BadRequestException('startDate must be a valid calendar date in YYYY-MM-DD format');
    }
    if (!isValidDateStr(endDate)) {
      throw new BadRequestException('endDate must be a valid calendar date in YYYY-MM-DD format');
    }
    if (endDate < startDate) {
      throw new BadRequestException('endDate cannot be earlier than startDate');
    }
    // A whole year of daily rows per user is already a lot to hand to a browser.
    if (countDaysInclusive(startDate, endDate) > 366) {
      throw new BadRequestException('The reporting range cannot exceed 366 days');
    }

    return { startDate, endDate };
  }

  /**
   * Per-user attendance totals for the window.
   *
   * Every tenant member is included, even those with no attendance rows at all —
   * a report that silently omits the people who never checked in would hide
   * exactly the cases it exists to surface.
   */
  async getTeamReport(tenantId: string, actor: AttendanceActor, query: AttendanceReportQueryDto) {
    this.assertAdmin(actor);
    const { startDate, endDate } = await this.resolveRange(tenantId, query);
    const scopedUserId = query.userId;

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    // ── 1. The roster: active members of the tenant ──────────────────────────
    const memberFilters = [eq(userTenants.tenantId, tenantId), eq(userTenants.status, 'active')];
    if (scopedUserId) memberFilters.push(eq(userTenants.userId, scopedUserId));
    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      memberFilters.push(or(ilike(users.name, term), ilike(users.email, term))!);
    }

    const members = await this.db
      .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(userTenants)
      .innerJoin(users, eq(userTenants.userId, users.id))
      .where(and(...memberFilters))
      .orderBy(asc(users.name));

    if (members.length === 0) {
      return this.emptyReport(startDate, endDate, page, limit);
    }

    // ── 2. Aggregate attendance for those members in one grouped query ───────
    const memberIds = members.map((m) => m.id);
    // The cast is explicit so Postgres never has to infer the parameter's type
    // against the `attendance_status` enum.
    const countIf = (status: string) =>
      sql<number>`count(*) filter (where ${attendanceRecords.status} = ${status}::attendance_status)`;

    const aggregates = await this.db
      .select({
        userId: attendanceRecords.userId,
        presentDays: countIf('present'),
        halfDays: countIf('half_day'),
        absentDays: countIf('absent'),
        leaveDays: countIf('on_leave'),
        holidayDays: countIf('holiday'),
        weekOffDays: countIf('week_off'),
        lateDays: sql<number>`count(*) filter (where ${attendanceRecords.isLate})`,
        workedDays: sql<number>`count(*) filter (where coalesce(${attendanceRecords.totalWorkingMinutes}, 0) > 0)`,
        totalWorkingMinutes: sql<number>`coalesce(sum(${attendanceRecords.totalWorkingMinutes}), 0)`,
        overtimeMinutes: sql<number>`coalesce(sum(${attendanceRecords.overtimeMinutes}), 0)`,
        totalLateMinutes: sql<number>`coalesce(sum(${attendanceRecords.lateByMinutes}), 0)`,
        firstCheckInDate: sql<string | null>`min(${attendanceRecords.date}) filter (where ${attendanceRecords.firstCheckInAt} is not null)`,
        lastCheckInDate: sql<string | null>`max(${attendanceRecords.date}) filter (where ${attendanceRecords.firstCheckInAt} is not null)`,
      })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.tenantId, tenantId),
          gte(attendanceRecords.date, startDate),
          lte(attendanceRecords.date, endDate),
          inArray(attendanceRecords.userId, memberIds),
        ),
      )
      .groupBy(attendanceRecords.userId);

    const byUser = new Map(aggregates.map((a) => [a.userId, a]));

    // ── 3. Merge roster + aggregates into report rows ────────────────────────
    let rows: AttendanceReportRow[] = members.map((member) => {
      const agg = byUser.get(member.id);
      const presentDays = Number(agg?.presentDays ?? 0);
      const halfDays = Number(agg?.halfDays ?? 0);
      const absentDays = Number(agg?.absentDays ?? 0);
      const leaveDays = Number(agg?.leaveDays ?? 0);
      const holidayDays = Number(agg?.holidayDays ?? 0);
      const weekOffDays = Number(agg?.weekOffDays ?? 0);
      const workedDays = Number(agg?.workedDays ?? 0);
      const totalWorkingMinutes = Number(agg?.totalWorkingMinutes ?? 0);
      const overtimeMinutes = Number(agg?.overtimeMinutes ?? 0);

      // Holidays and week-offs are not payable days, so they are excluded from
      // the denominator rather than counting against the agent.
      const payableDays = presentDays + halfDays + absentDays + leaveDays;
      const attended = presentDays + halfDays * 0.5;

      return {
        userId: member.id,
        name: member.name,
        email: member.email ?? null,
        phone: member.phone ?? null,
        presentDays,
        halfDays,
        absentDays,
        leaveDays,
        holidayDays,
        weekOffDays,
        lateDays: Number(agg?.lateDays ?? 0),
        workedDays,
        totalWorkingMinutes,
        totalWorkingHours: (totalWorkingMinutes / 60).toFixed(1),
        avgWorkingHours: workedDays > 0 ? (totalWorkingMinutes / workedDays / 60).toFixed(1) : '0.0',
        overtimeMinutes,
        overtimeHours: (overtimeMinutes / 60).toFixed(1),
        totalLateMinutes: Number(agg?.totalLateMinutes ?? 0),
        attendancePercentage: payableDays > 0 ? Math.round((attended / payableDays) * 1000) / 10 : 0,
        firstCheckInDate: agg?.firstCheckInDate ?? null,
        lastCheckInDate: agg?.lastCheckInDate ?? null,
      };
    });

    // ── 4. Post-aggregate filters ────────────────────────────────────────────
    if (query.lateOnly === 'true') {
      rows = rows.filter((r) => r.lateDays > 0);
    }
    if (query.status) {
      const statusKey: Record<string, keyof AttendanceReportRow> = {
        present: 'presentDays',
        half_day: 'halfDays',
        absent: 'absentDays',
        on_leave: 'leaveDays',
        holiday: 'holidayDays',
        week_off: 'weekOffDays',
      };
      const key = statusKey[query.status];
      rows = rows.filter((r) => Number(r[key]) > 0);
    }

    // ── 5. Sort, then paginate in memory (one page of a tenant roster) ───────
    const sortBy = query.sortBy ?? 'name';
    const direction = (query.sortOrder ?? (sortBy === 'name' ? 'asc' : 'desc')) === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[sortBy as keyof AttendanceReportRow];
      const bv = b[sortBy as keyof AttendanceReportRow];
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * direction;
      }
      return (Number(av) - Number(bv)) * direction;
    });

    const totals = this.buildTotals(rows);
    const total = rows.length;
    const offset = PaginationUtil.getOffset(page, limit);
    const paged = rows.slice(offset, offset + limit);

    return {
      ...PaginationUtil.buildPaginatedResult(paged, total, page, limit),
      range: { startDate, endDate, totalDays: countDaysInclusive(startDate, endDate) },
      totals,
    };
  }

  private buildTotals(rows: AttendanceReportRow[]) {
    const sum = (key: keyof AttendanceReportRow) =>
      rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);

    const totalWorkingMinutes = sum('totalWorkingMinutes');
    const presentDays = sum('presentDays');
    const halfDays = sum('halfDays');
    const payable = presentDays + halfDays + sum('absentDays') + sum('leaveDays');

    return {
      agents: rows.length,
      presentDays,
      halfDays,
      absentDays: sum('absentDays'),
      leaveDays: sum('leaveDays'),
      holidayDays: sum('holidayDays'),
      weekOffDays: sum('weekOffDays'),
      lateDays: sum('lateDays'),
      totalWorkingHours: (totalWorkingMinutes / 60).toFixed(1),
      overtimeHours: (sum('overtimeMinutes') / 60).toFixed(1),
      avgAttendancePercentage:
        payable > 0 ? Math.round(((presentDays + halfDays * 0.5) / payable) * 1000) / 10 : 0,
    };
  }

  private emptyReport(startDate: string, endDate: string, page: number, limit: number) {
    return {
      ...PaginationUtil.buildPaginatedResult<AttendanceReportRow>([], 0, page, limit),
      range: { startDate, endDate, totalDays: countDaysInclusive(startDate, endDate) },
      totals: this.buildTotals([]),
    };
  }

  /**
   * The classic attendance register: one row per agent, one column per date.
   * Capped at 62 days because beyond that the grid stops being readable and the
   * payload grows quadratically.
   */
  async getRegister(tenantId: string, actor: AttendanceActor, query: AttendanceReportQueryDto) {
    this.assertAdmin(actor);
    const { startDate, endDate } = await this.resolveRange(tenantId, query);

    if (countDaysInclusive(startDate, endDate) > 62) {
      throw new BadRequestException('The register view is limited to 62 days — narrow the range or use a month');
    }

    const scopedUserId = query.userId;

    const memberFilters = [eq(userTenants.tenantId, tenantId), eq(userTenants.status, 'active')];
    if (scopedUserId) memberFilters.push(eq(userTenants.userId, scopedUserId));
    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      memberFilters.push(or(ilike(users.name, term), ilike(users.email, term))!);
    }

    const members = await this.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(userTenants)
      .innerJoin(users, eq(userTenants.userId, users.id))
      .where(and(...memberFilters))
      .orderBy(asc(users.name));

    const dates = eachDateInRange(startDate, endDate);
    if (members.length === 0) {
      return { range: { startDate, endDate }, dates, rows: [] };
    }

    const records = await this.db
      .select({
        userId: attendanceRecords.userId,
        date: attendanceRecords.date,
        status: attendanceRecords.status,
        isLate: attendanceRecords.isLate,
        totalWorkingMinutes: attendanceRecords.totalWorkingMinutes,
        firstCheckInAt: attendanceRecords.firstCheckInAt,
        lastCheckOutAt: attendanceRecords.lastCheckOutAt,
      })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.tenantId, tenantId),
          gte(attendanceRecords.date, startDate),
          lte(attendanceRecords.date, endDate),
          inArray(attendanceRecords.userId, members.map((m) => m.id)),
        ),
      );

    const byUserDate = new Map<string, (typeof records)[number]>();
    for (const rec of records) byUserDate.set(`${rec.userId}|${rec.date}`, rec);

    const rows = members.map((member) => ({
      userId: member.id,
      name: member.name,
      email: member.email,
      days: dates.map((date) => {
        const rec = byUserDate.get(`${member.id}|${date}`);
        return {
          date,
          // `null` means no record at all — distinct from an explicit 'absent'.
          status: rec?.status ?? null,
          isLate: rec?.isLate ?? false,
          workingMinutes: rec?.totalWorkingMinutes ?? 0,
          firstCheckInAt: rec?.firstCheckInAt ?? null,
          lastCheckOutAt: rec?.lastCheckOutAt ?? null,
        };
      }),
    }));

    return { range: { startDate, endDate }, dates, rows };
  }

  // ── Excel export ──────────────────────────────────────────────────────────

  private static readonly HEADER_FILL = 'FF1B2D4F';
  private static readonly HEADER_ACCENT = 'FFC9A227';

  /** Summary + register in one styled workbook, matching the leads export style. */
  async exportToXlsx(
    tenantId: string,
    actor: AttendanceActor,
    query: AttendanceReportQueryDto,
  ): Promise<Buffer> {
    // Pull every row, not just the current page.
    const report = await this.getTeamReport(tenantId, actor, { ...query, page: 1, limit: 500 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Softaro CRM';
    workbook.created = new Date();

    this.buildSummarySheet(workbook, report);

    // The register is only included when the range is small enough to be useful.
    if (countDaysInclusive(report.range.startDate, report.range.endDate) <= 62) {
      const register = await this.getRegister(tenantId, actor, query);
      this.buildRegisterSheet(workbook, register);
    }

    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }

  private styleHeaderRow(sheet: ExcelJS.Worksheet, rowNumber = 1) {
    const headerRow = sheet.getRow(rowNumber);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AttendanceReportService.HEADER_FILL } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'medium', color: { argb: AttendanceReportService.HEADER_ACCENT } } };
    });
  }

  private buildSummarySheet(
    workbook: ExcelJS.Workbook,
    report: Awaited<ReturnType<AttendanceReportService['getTeamReport']>>,
  ) {
    const sheet = workbook.addWorksheet('Attendance Summary', {
      views: [{ state: 'frozen', ySplit: 3 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    // Title band
    sheet.mergeCells('A1:N1');
    const title = sheet.getCell('A1');
    title.value = `Attendance Report — ${report.range.startDate} to ${report.range.endDate} (${report.range.totalDays} days)`;
    title.font = { bold: true, size: 13, color: { argb: AttendanceReportService.HEADER_FILL } };
    title.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(1).height = 26;
    sheet.getRow(2).height = 6;

    sheet.getRow(3).values = [
      'Agent', 'Email', 'Phone', 'Present', 'Half Day', 'Absent', 'Leave',
      'Holiday', 'Week Off', 'Late Days', 'Worked Days', 'Total Hours', 'Avg Hours', 'Attendance %',
    ];
    sheet.columns = [
      { key: 'name', width: 26 },
      { key: 'email', width: 30 },
      { key: 'phone', width: 16 },
      { key: 'presentDays', width: 10 },
      { key: 'halfDays', width: 10 },
      { key: 'absentDays', width: 10 },
      { key: 'leaveDays', width: 10 },
      { key: 'holidayDays', width: 10 },
      { key: 'weekOffDays', width: 11 },
      { key: 'lateDays', width: 11 },
      { key: 'workedDays', width: 13 },
      { key: 'totalWorkingHours', width: 13 },
      { key: 'avgWorkingHours', width: 12 },
      { key: 'attendancePercentage', width: 14 },
    ];
    this.styleHeaderRow(sheet, 3);

    report.data.forEach((row, idx) => {
      const dataRow = sheet.addRow({
        name: row.name,
        email: row.email ?? '',
        phone: row.phone ?? '',
        presentDays: row.presentDays,
        halfDays: row.halfDays,
        absentDays: row.absentDays,
        leaveDays: row.leaveDays,
        holidayDays: row.holidayDays,
        weekOffDays: row.weekOffDays,
        lateDays: row.lateDays,
        workedDays: row.workedDays,
        totalWorkingHours: Number(row.totalWorkingHours),
        avgWorkingHours: Number(row.avgWorkingHours),
        attendancePercentage: row.attendancePercentage / 100,
      });
      dataRow.height = 20;

      const stripe = idx % 2 === 0 ? 'FFF8FAFD' : 'FFFFFFFF';
      dataRow.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stripe } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
        if (col >= 4) cell.alignment = { horizontal: 'center' };
      });

      // Attendance % as a real percentage, tinted by how healthy it is.
      const pctCell = dataRow.getCell('attendancePercentage');
      pctCell.numFmt = '0.0%';
      const pct = row.attendancePercentage;
      pctCell.font = {
        bold: true,
        color: { argb: pct >= 90 ? 'FF15803D' : pct >= 75 ? 'FFD97706' : 'FFC0392B' },
      };
    });

    // Totals band
    const totals = report.totals;
    const totalsRow = sheet.addRow({
      name: 'TOTAL',
      email: `${totals.agents} agent(s)`,
      phone: '',
      presentDays: totals.presentDays,
      halfDays: totals.halfDays,
      absentDays: totals.absentDays,
      leaveDays: totals.leaveDays,
      holidayDays: totals.holidayDays,
      weekOffDays: totals.weekOffDays,
      lateDays: totals.lateDays,
      workedDays: '',
      totalWorkingHours: Number(totals.totalWorkingHours),
      avgWorkingHours: '',
      attendancePercentage: totals.avgAttendancePercentage / 100,
    });
    totalsRow.height = 22;
    totalsRow.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF3F9' } };
      cell.font = { bold: true, color: { argb: AttendanceReportService.HEADER_FILL } };
      cell.border = { top: { style: 'medium', color: { argb: AttendanceReportService.HEADER_ACCENT } } };
      if (col >= 4) cell.alignment = { horizontal: 'center' };
    });
    totalsRow.getCell('attendancePercentage').numFmt = '0.0%';

    sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 14 } };
  }

  private buildRegisterSheet(
    workbook: ExcelJS.Workbook,
    register: Awaited<ReturnType<AttendanceReportService['getRegister']>>,
  ) {
    const sheet = workbook.addWorksheet('Daily Register', {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    sheet.getRow(1).values = ['Agent', ...register.dates.map((d) => d.slice(8))];
    sheet.getColumn(1).width = 26;
    for (let i = 2; i <= register.dates.length + 1; i += 1) sheet.getColumn(i).width = 5;
    this.styleHeaderRow(sheet, 1);

    // Single letters keep a 31-column grid readable.
    const codes: Record<string, { letter: string; fill: string; font: string }> = {
      present:  { letter: 'P', fill: 'FFDCFCE7', font: 'FF15803D' },
      half_day: { letter: 'H', fill: 'FFFEF3C7', font: 'FFD97706' },
      absent:   { letter: 'A', fill: 'FFFDE8E8', font: 'FFC0392B' },
      on_leave: { letter: 'L', fill: 'FFDBEAFE', font: 'FF2563EB' },
      holiday:  { letter: 'O', fill: 'FFE0F2FE', font: 'FF0369A1' },
      week_off: { letter: 'W', fill: 'FFF1F5F9', font: 'FF64748B' },
    };

    register.rows.forEach((row) => {
      const dataRow = sheet.addRow([row.name, ...row.days.map((d) => (d.status ? codes[d.status].letter : '—'))]);
      dataRow.height = 20;
      dataRow.getCell(1).font = { bold: true };

      row.days.forEach((day, idx) => {
        const cell = dataRow.getCell(idx + 2);
        const code = day.status ? codes[day.status] : null;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: code?.fill ?? 'FFFFFFFF' } };
        cell.font = { bold: true, size: 10, color: { argb: code?.font ?? 'FFCBD5E1' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
        if (day.isLate) {
          // Late arrivals get a gold underline so they stand out inside a 'P' cell.
          cell.border = { ...cell.border, bottom: { style: 'medium', color: { argb: 'FFC9A227' } } };
        }
      });
    });

    // Legend
    sheet.addRow([]);
    const legend = sheet.addRow(['Legend: P Present · H Half Day · A Absent · L Leave · O Holiday · W Week Off · gold underline = late']);
    legend.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
    sheet.mergeCells(legend.number, 1, legend.number, Math.min(register.dates.length + 1, 16));
  }
}
