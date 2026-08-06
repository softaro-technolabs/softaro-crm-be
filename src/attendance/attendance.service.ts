import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { eq, and, or, sql, asc, desc, gte, lte, lt, inArray, ilike, isNull, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import {
  attendanceSettings,
  attendanceLocations,
  attendanceRecords,
  attendanceCheckIns,
  locationTrackingLogs,
  leaveRequests,
  leaveBalances,
  roles,
  users,
} from '../database/schema';
import {
  CheckInDto,
  CheckOutDto,
  LocationPingDto,
  UpdateAttendanceSettingsDto,
  CreateAttendanceLocationDto,
  UpdateAttendanceLocationDto,
  AttendanceRecordsQueryDto,
  RegularizeAttendanceDto,
  CreateLeaveRequestDto,
  ReviewLeaveRequestDto,
  LeaveRequestsQueryDto,
  UpsertLeaveBalanceDto,
  AttendanceStatusValue,
  LeaveTypeValue,
} from './attendance.dto';
import { PaginationUtil } from '../common/utils/pagination.util';
import { RequestContextService } from '../common/utils/request-context.service';
import {
  DEFAULT_TIMEZONE,
  countDaysInclusive,
  eachDateInRange,
  haversineDistance,
  isValidDateStr,
  monthRange,
  parseClockTime,
  zonedDateStr,
  zonedMinutesOfDay,
  zonedTimeToUtc,
  zonedWeekday,
} from './attendance.util';

/** Who is making the request, and whether they may act on other users' data. */
export interface AttendanceActor {
  userId: string;
  isAdmin: boolean;
}

/** Statuses an admin has pinned deliberately — the recalculation must not clobber them. */
const MANUAL_STATUSES: AttendanceStatusValue[] = ['on_leave', 'holiday', 'week_off'];

/** Leave types that do not consume balance and do not mark the day as `on_leave`. */
const NON_DEDUCTING_LEAVE_TYPES: LeaveTypeValue[] = ['work_from_home'];

const RECORD_SORT_COLUMNS = {
  date: attendanceRecords.date,
  status: attendanceRecords.status,
  totalWorkingMinutes: attendanceRecords.totalWorkingMinutes,
  firstCheckInAt: attendanceRecords.firstCheckInAt,
  lastCheckOutAt: attendanceRecords.lastCheckOutAt,
  lateByMinutes: attendanceRecords.lateByMinutes,
  createdAt: attendanceRecords.createdAt,
} as const;

const LEAVE_SORT_COLUMNS = {
  createdAt: leaveRequests.createdAt,
  startDate: leaveRequests.startDate,
  endDate: leaveRequests.endDate,
  status: leaveRequests.status,
  leaveType: leaveRequests.leaveType,
} as const;

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly requestContext: RequestContextService,
  ) {}

  // ── Actor resolution & authorization ─────────────────────────────────────

  /**
   * Verifies tenant membership and resolves whether the caller holds an admin role.
   * Admin is derived from `roles.is_admin` (the same flag the frontend uses), with
   * platform super-admins always treated as admins.
   */
  async resolveActor(tenantId: string): Promise<AttendanceActor> {
    this.requestContext.verifyTenantAccess(tenantId);

    const userId = this.requestContext.getUserId();
    if (!userId) throw new ForbiddenException('User context not found');

    const ctx = this.requestContext.getUser();
    if (ctx?.role_global === 'super_admin') return { userId, isAdmin: true };

    let isAdmin = false;
    if (ctx?.role_id) {
      const [role] = await this.db
        .select({ isAdmin: roles.isAdmin })
        .from(roles)
        .where(and(eq(roles.id, ctx.role_id), eq(roles.tenantId, tenantId)))
        .limit(1);
      isAdmin = role?.isAdmin ?? false;
    }

    return { userId, isAdmin };
  }

  private assertAdmin(actor: AttendanceActor, action = 'perform this action'): void {
    if (!actor.isAdmin) {
      throw new ForbiddenException(`You do not have permission to ${action}`);
    }
  }

  /**
   * Resolves which user's data a read should return.
   * Admins may target anyone (or everyone, when `requested` is empty);
   * everybody else is pinned to their own records.
   */
  private scopeUserId(actor: AttendanceActor, requested?: string): string | undefined {
    if (actor.isAdmin) return requested;
    if (requested && requested !== actor.userId) {
      throw new ForbiddenException('You can only access your own attendance data');
    }
    return actor.userId;
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  async getSettings(tenantId: string) {
    const [existing] = await this.db
      .select()
      .from(attendanceSettings)
      .where(eq(attendanceSettings.tenantId, tenantId))
      .limit(1);

    if (existing) return existing;

    // Auto-create default settings for the tenant. `onConflictDoNothing` keeps this
    // safe when two requests race to create the same tenant's row.
    await this.db
      .insert(attendanceSettings)
      .values({
        id: randomUUID(),
        tenantId,
        workingHours: {
          start: '09:00',
          end: '18:00',
          timezone: DEFAULT_TIMEZONE,
          workingDays: [1, 2, 3, 4, 5],
        },
      })
      .onConflictDoNothing({ target: attendanceSettings.tenantId });

    const [created] = await this.db
      .select()
      .from(attendanceSettings)
      .where(eq(attendanceSettings.tenantId, tenantId))
      .limit(1);
    return created;
  }

  /** The tenant's working timezone — every date boundary in this module uses it. */
  private timezoneOf(settings: { workingHours?: { timezone?: string } | null }): string {
    return settings.workingHours?.timezone || DEFAULT_TIMEZONE;
  }

  /**
   * Today's date in the tenant's timezone. Used for endpoint defaults so that
   * "today" means the agent's today, not the server's.
   */
  todayFor(settings: { workingHours?: { timezone?: string } | null }): string {
    return zonedDateStr(new Date(), this.timezoneOf(settings));
  }

  async updateSettings(tenantId: string, actor: AttendanceActor, dto: UpdateAttendanceSettingsDto) {
    this.assertAdmin(actor, 'change attendance settings');
    const settings = await this.getSettings(tenantId);

    if (
      dto.halfDayThresholdHours !== undefined &&
      dto.fullDayThresholdHours !== undefined &&
      dto.halfDayThresholdHours > dto.fullDayThresholdHours
    ) {
      throw new BadRequestException('Half-day threshold cannot be greater than the full-day threshold');
    }

    const updateData: Partial<typeof attendanceSettings.$inferInsert> = {};
    if (dto.defaultCheckInRadiusMeters !== undefined) updateData.defaultCheckInRadiusMeters = dto.defaultCheckInRadiusMeters;
    if (dto.requireSelfie !== undefined) updateData.requireSelfie = dto.requireSelfie;
    if (dto.requireLocation !== undefined) updateData.requireLocation = dto.requireLocation;
    if (dto.allowRemoteCheckIn !== undefined) updateData.allowRemoteCheckIn = dto.allowRemoteCheckIn;
    if (dto.workingHours !== undefined) updateData.workingHours = dto.workingHours;
    if (dto.lateThresholdMinutes !== undefined) updateData.lateThresholdMinutes = dto.lateThresholdMinutes;
    if (dto.halfDayThresholdHours !== undefined) updateData.halfDayThresholdHours = String(dto.halfDayThresholdHours);
    if (dto.fullDayThresholdHours !== undefined) updateData.fullDayThresholdHours = String(dto.fullDayThresholdHours);
    if (dto.autoCheckoutEnabled !== undefined) updateData.autoCheckoutEnabled = dto.autoCheckoutEnabled;
    if (dto.autoCheckoutTime !== undefined) updateData.autoCheckoutTime = dto.autoCheckoutTime;
    if (dto.siteVisitAutoAttendance !== undefined) updateData.siteVisitAutoAttendance = dto.siteVisitAutoAttendance;
    updateData.updatedAt = new Date();

    await this.db.update(attendanceSettings).set(updateData).where(eq(attendanceSettings.id, settings.id));
    return this.getSettings(tenantId);
  }

  // ── Locations ────────────────────────────────────────────────────────────

  async getLocations(tenantId: string, type?: string, activeOnly = true) {
    const filters = [eq(attendanceLocations.tenantId, tenantId)];
    if (activeOnly) filters.push(eq(attendanceLocations.isActive, true));
    if (type) filters.push(eq(attendanceLocations.type, type as any));

    return this.db
      .select()
      .from(attendanceLocations)
      .where(and(...filters))
      .orderBy(attendanceLocations.name);
  }

  async createLocation(tenantId: string, actor: AttendanceActor, dto: CreateAttendanceLocationDto) {
    this.assertAdmin(actor, 'create attendance locations');

    const id = randomUUID();
    const settings = await this.getSettings(tenantId);

    await this.db.insert(attendanceLocations).values({
      id,
      tenantId,
      name: dto.name,
      type: dto.type,
      latitude: String(dto.latitude),
      longitude: String(dto.longitude),
      radiusMeters: dto.radiusMeters || settings.defaultCheckInRadiusMeters,
      address: dto.address ?? null,
      propertyEntityId: dto.propertyEntityId ?? null,
    });

    const [loc] = await this.db.select().from(attendanceLocations).where(eq(attendanceLocations.id, id)).limit(1);
    return loc;
  }

  async updateLocation(
    tenantId: string,
    actor: AttendanceActor,
    locationId: string,
    dto: UpdateAttendanceLocationDto,
  ) {
    this.assertAdmin(actor, 'update attendance locations');

    const [loc] = await this.db
      .select()
      .from(attendanceLocations)
      .where(and(eq(attendanceLocations.id, locationId), eq(attendanceLocations.tenantId, tenantId)))
      .limit(1);

    if (!loc) throw new NotFoundException('Location not found');

    const updateData: Partial<typeof attendanceLocations.$inferInsert> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.latitude !== undefined) updateData.latitude = String(dto.latitude);
    if (dto.longitude !== undefined) updateData.longitude = String(dto.longitude);
    if (dto.radiusMeters !== undefined) updateData.radiusMeters = dto.radiusMeters;
    if (dto.address !== undefined) updateData.address = dto.address;
    if (dto.propertyEntityId !== undefined) updateData.propertyEntityId = dto.propertyEntityId || null;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    updateData.updatedAt = new Date();

    await this.db.update(attendanceLocations).set(updateData).where(eq(attendanceLocations.id, locationId));

    const [updated] = await this.db.select().from(attendanceLocations).where(eq(attendanceLocations.id, locationId)).limit(1);
    return updated;
  }

  /**
   * Deactivates a location rather than deleting it, so historical check-ins keep
   * pointing at a row that still explains where the agent was.
   */
  async deactivateLocation(tenantId: string, actor: AttendanceActor, locationId: string) {
    this.assertAdmin(actor, 'delete attendance locations');
    return this.updateLocation(tenantId, actor, locationId, { isActive: false });
  }

  // ── Geo-fence matching ───────────────────────────────────────────────────

  private async matchGeoFence(
    tenantId: string,
    lat: number,
    lng: number,
  ): Promise<{ locationId: string; locationName: string; locationType: string; distance: number } | null> {
    const locations = await this.getLocations(tenantId, undefined, true);

    let best: { locationId: string; locationName: string; locationType: string; distance: number } | null = null;

    for (const loc of locations) {
      const dist = haversineDistance(lat, lng, Number(loc.latitude), Number(loc.longitude));
      if (dist <= loc.radiusMeters && (!best || dist < best.distance)) {
        best = {
          locationId: loc.id,
          locationName: loc.name,
          locationType: loc.type,
          distance: Math.round(dist),
        };
      }
    }

    return best;
  }

  /** `attendance_locations.type` and the check-in `location_type` enum are not the same set. */
  private toCheckInLocationType(locationType?: string | null) {
    return locationType === 'office' || locationType === 'property_site' ? locationType : 'field';
  }

  // ── Daily record helpers ─────────────────────────────────────────────────

  /**
   * Returns the user's record for `dateStr`, creating it when absent.
   * The insert relies on the `(tenant, user, date)` unique index to stay correct
   * when two check-ins race.
   */
  private async getOrCreateDailyRecord(
    tenantId: string,
    userId: string,
    dateStr: string,
    seed: Partial<typeof attendanceRecords.$inferInsert> = {},
  ) {
    const [existing] = await this.db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.tenantId, tenantId),
          eq(attendanceRecords.userId, userId),
          eq(attendanceRecords.date, dateStr),
        ),
      )
      .limit(1);

    if (existing) return existing;

    await this.db
      .insert(attendanceRecords)
      .values({
        id: randomUUID(),
        tenantId,
        userId,
        date: dateStr,
        status: 'present',
        ...seed,
      })
      .onConflictDoNothing({
        target: [attendanceRecords.tenantId, attendanceRecords.userId, attendanceRecords.date],
      });

    const [record] = await this.db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.tenantId, tenantId),
          eq(attendanceRecords.userId, userId),
          eq(attendanceRecords.date, dateStr),
        ),
      )
      .limit(1);

    return record;
  }

  /** Late-arrival calculation, evaluated against the tenant's working timezone. */
  private computeLateness(
    now: Date,
    settings: Awaited<ReturnType<AttendanceService['getSettings']>>,
  ): { isLate: boolean; lateByMinutes: number } {
    const timezone = this.timezoneOf(settings);
    const startMinutes = parseClockTime(settings.workingHours?.start);
    if (startMinutes === null) return { isLate: false, lateByMinutes: 0 };

    // Nobody is "late" on a day they were not rostered to work.
    const workingDays = settings.workingHours?.workingDays;
    if (Array.isArray(workingDays) && workingDays.length > 0) {
      if (!workingDays.includes(zonedWeekday(now, timezone))) {
        return { isLate: false, lateByMinutes: 0 };
      }
    }

    const graceMinutes = settings.lateThresholdMinutes ?? 15;
    const cutoff = startMinutes + graceMinutes;
    const arrival = zonedMinutesOfDay(now, timezone);

    if (arrival <= cutoff) return { isLate: false, lateByMinutes: 0 };
    return { isLate: true, lateByMinutes: arrival - cutoff };
  }

  // ── Check-in ─────────────────────────────────────────────────────────────

  async checkIn(tenantId: string, userId: string, dto: CheckInDto) {
    const settings = await this.getSettings(tenantId);
    const timezone = this.timezoneOf(settings);
    const now = new Date();
    const dateStr = zonedDateStr(now, timezone);

    if (settings.requireSelfie && !dto.selfieUrl) {
      throw new BadRequestException('A selfie is required to check in.');
    }

    const openCheckIn = await this.getOpenCheckIn(tenantId, userId);
    if (openCheckIn) {
      throw new BadRequestException('Already checked in. Please check out first.');
    }

    // Geo-fence validation. `requireLocation = false` means the tenant does not
    // police where people check in from, so the fence is advisory only.
    const match = await this.matchGeoFence(tenantId, dto.latitude, dto.longitude);
    if (settings.requireLocation && !match && !settings.allowRemoteCheckIn) {
      throw new BadRequestException(
        'You are not within any registered location. Please move closer to check in.',
      );
    }

    const { isLate, lateByMinutes } = this.computeLateness(now, settings);

    const record = await this.getOrCreateDailyRecord(tenantId, userId, dateStr, {
      status: 'present',
      firstCheckInAt: now,
      isLate,
      lateByMinutes,
    });

    // The record may pre-date this check-in (created by a leave approval, or by an
    // absent-marking job), in which case the arrival fields still need filling in.
    const recordPatch: Partial<typeof attendanceRecords.$inferInsert> = {};
    if (!record.firstCheckInAt) {
      recordPatch.firstCheckInAt = now;
      recordPatch.isLate = isLate;
      recordPatch.lateByMinutes = lateByMinutes;
    }
    if (record.status === 'absent') recordPatch.status = 'present';
    if (Object.keys(recordPatch).length > 0) {
      recordPatch.updatedAt = new Date();
      await this.db.update(attendanceRecords).set(recordPatch).where(eq(attendanceRecords.id, record.id));
    }

    const checkInId = randomUUID();
    await this.db.insert(attendanceCheckIns).values({
      id: checkInId,
      tenantId,
      userId,
      attendanceRecordId: record.id,
      checkInAt: now,
      checkInLatitude: String(dto.latitude),
      checkInLongitude: String(dto.longitude),
      checkInLocationId: match?.locationId ?? null,
      checkInSelfieUrl: dto.selfieUrl ?? null,
      checkInAddress: dto.address ?? null,
      locationType: this.toCheckInLocationType(match?.locationType) as any,
      deviceInfo: dto.deviceInfo ?? null,
    });

    return {
      checkInId,
      recordId: record.id,
      checkedInAt: now.toISOString(),
      location: match
        ? { name: match.locationName, type: match.locationType, distance: match.distance }
        : { name: 'Field / Remote', type: 'field', distance: null },
      isLate: recordPatch.isLate ?? record.isLate,
      lateByMinutes: recordPatch.lateByMinutes ?? record.lateByMinutes ?? 0,
    };
  }

  // ── Check-out ────────────────────────────────────────────────────────────

  async checkOut(tenantId: string, userId: string, dto: CheckOutDto) {
    const settings = await this.getSettings(tenantId);
    const now = new Date();

    if (settings.requireSelfie && !dto.selfieUrl) {
      throw new BadRequestException('A selfie is required to check out.');
    }

    const openCheckIn = await this.getOpenCheckIn(tenantId, userId);
    if (!openCheckIn) {
      throw new BadRequestException('No open check-in found. Please check in first.');
    }

    const match = await this.matchGeoFence(tenantId, dto.latitude, dto.longitude);

    // Clamp at zero: a device with a skewed clock must not create negative worked time.
    const durationMinutes = Math.max(
      0,
      Math.floor((now.getTime() - new Date(openCheckIn.checkInAt).getTime()) / 60000),
    );

    await this.db.update(attendanceCheckIns).set({
      checkOutAt: now,
      checkOutLatitude: String(dto.latitude),
      checkOutLongitude: String(dto.longitude),
      checkOutLocationId: match?.locationId ?? null,
      checkOutSelfieUrl: dto.selfieUrl ?? null,
      checkOutAddress: dto.address ?? null,
      durationMinutes,
    }).where(eq(attendanceCheckIns.id, openCheckIn.id));

    await this.recalculateDailyRecord(openCheckIn.attendanceRecordId);

    return {
      checkInId: openCheckIn.id,
      checkedOutAt: now.toISOString(),
      durationMinutes,
      location: match
        ? { name: match.locationName, type: match.locationType }
        : { name: 'Field / Remote', type: 'field' },
    };
  }

  // ── My Status ────────────────────────────────────────────────────────────

  async getMyStatus(tenantId: string, userId: string) {
    const settings = await this.getSettings(tenantId);
    const dateStr = zonedDateStr(new Date(), this.timezoneOf(settings));

    const [record] = await this.db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.tenantId, tenantId),
          eq(attendanceRecords.userId, userId),
          eq(attendanceRecords.date, dateStr),
        ),
      )
      .limit(1);

    const openCheckIn = await this.getOpenCheckIn(tenantId, userId);

    const todayCheckIns = record
      ? await this.db
          .select()
          .from(attendanceCheckIns)
          .where(eq(attendanceCheckIns.attendanceRecordId, record.id))
          .orderBy(attendanceCheckIns.checkInAt)
      : [];

    return {
      date: dateStr,
      timezone: this.timezoneOf(settings),
      isCheckedIn: !!openCheckIn,
      /** True once the day has at least one completed session and none are open. */
      isCheckedOut: !openCheckIn && todayCheckIns.length > 0,
      requireSelfie: settings.requireSelfie,
      currentCheckIn: openCheckIn || null,
      todayRecord: record || null,
      todayCheckIns,
    };
  }

  // ── Location Ping ────────────────────────────────────────────────────────

  async locationPing(tenantId: string, userId: string, dto: LocationPingDto) {
    const openCheckIn = await this.getOpenCheckIn(tenantId, userId);

    await this.db.insert(locationTrackingLogs).values({
      id: randomUUID(),
      tenantId,
      userId,
      checkInId: openCheckIn?.id ?? null,
      latitude: String(dto.latitude),
      longitude: String(dto.longitude),
      accuracyMeters: dto.accuracy !== undefined ? String(dto.accuracy) : null,
      batteryLevel: dto.batteryLevel ?? null,
      recordedAt: new Date(),
    });

    return { success: true, tracked: !!openCheckIn };
  }

  // ── Records ──────────────────────────────────────────────────────────────

  async getRecords(tenantId: string, actor: AttendanceActor, query: AttendanceRecordsQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);
    const scopedUserId = this.scopeUserId(actor, query.userId);

    const filters: any[] = [eq(attendanceRecords.tenantId, tenantId)];
    if (scopedUserId) filters.push(eq(attendanceRecords.userId, scopedUserId));
    if (query.date) filters.push(eq(attendanceRecords.date, this.assertDate(query.date, 'date')));
    if (query.startDate) filters.push(gte(attendanceRecords.date, this.assertDate(query.startDate, 'startDate')));
    if (query.endDate) filters.push(lte(attendanceRecords.date, this.assertDate(query.endDate, 'endDate')));
    if (query.status) filters.push(eq(attendanceRecords.status, query.status));
    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      filters.push(or(ilike(users.name, term), ilike(users.email, term)));
    }

    const sortColumn =
      RECORD_SORT_COLUMNS[query.sortBy as keyof typeof RECORD_SORT_COLUMNS] ?? attendanceRecords.date;
    const orderBy = query.sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          record: attendanceRecords,
          user: { id: users.id, name: users.name, email: users.email, phone: users.phone },
        })
        .from(attendanceRecords)
        .leftJoin(users, eq(attendanceRecords.userId, users.id))
        .where(and(...filters))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(attendanceRecords)
        .leftJoin(users, eq(attendanceRecords.userId, users.id))
        .where(and(...filters)),
    ]);

    const results = rows.map((r) => ({ ...r.record, user: r.user }));
    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(results, total, page, limit);
  }

  async getRecordDetail(tenantId: string, actor: AttendanceActor, recordId: string) {
    const [row] = await this.db
      .select({
        record: attendanceRecords,
        user: { id: users.id, name: users.name, email: users.email, phone: users.phone },
      })
      .from(attendanceRecords)
      .leftJoin(users, eq(attendanceRecords.userId, users.id))
      .where(and(eq(attendanceRecords.id, recordId), eq(attendanceRecords.tenantId, tenantId)))
      .limit(1);

    if (!row) throw new NotFoundException('Record not found');
    this.scopeUserId(actor, row.record.userId);

    const checkIns = await this.db
      .select()
      .from(attendanceCheckIns)
      .where(eq(attendanceCheckIns.attendanceRecordId, recordId))
      .orderBy(attendanceCheckIns.checkInAt);

    return { ...row.record, user: row.user, checkIns };
  }

  async regularizeRecord(
    tenantId: string,
    actor: AttendanceActor,
    recordId: string,
    dto: RegularizeAttendanceDto,
  ) {
    this.assertAdmin(actor, 'regularize attendance records');

    const [record] = await this.db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.id, recordId), eq(attendanceRecords.tenantId, tenantId)))
      .limit(1);

    if (!record) throw new NotFoundException('Record not found');

    await this.db.update(attendanceRecords).set({
      status: dto.status,
      remarks: dto.remarks ?? record.remarks,
      metadata: {
        ...((record.metadata as Record<string, unknown>) || {}),
        regularized: true,
        regularizedAt: new Date().toISOString(),
        regularizedByUserId: actor.userId,
        previousStatus: record.status,
      },
      updatedAt: new Date(),
    }).where(eq(attendanceRecords.id, recordId));

    return this.getRecordDetail(tenantId, actor, recordId);
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  async getDailySummary(tenantId: string, actor: AttendanceActor, dateStr: string) {
    this.assertAdmin(actor, 'view the team attendance summary');
    const date = this.assertDate(dateStr, 'date');

    const rows = await this.db
      .select({
        record: attendanceRecords,
        user: { id: users.id, name: users.name, email: users.email, phone: users.phone },
      })
      .from(attendanceRecords)
      .leftJoin(users, eq(attendanceRecords.userId, users.id))
      .where(and(eq(attendanceRecords.tenantId, tenantId), eq(attendanceRecords.date, date)))
      .orderBy(users.name);

    const records = rows.map((r) => ({ ...r.record, user: r.user }));

    return {
      date,
      total: records.length,
      present: records.filter((r) => r.status === 'present').length,
      absent: records.filter((r) => r.status === 'absent').length,
      halfDay: records.filter((r) => r.status === 'half_day').length,
      onLeave: records.filter((r) => r.status === 'on_leave').length,
      holiday: records.filter((r) => r.status === 'holiday').length,
      weekOff: records.filter((r) => r.status === 'week_off').length,
      late: records.filter((r) => r.isLate).length,
      records,
    };
  }

  async getMonthlySummary(tenantId: string, actor: AttendanceActor, month: string, userId?: string) {
    const scopedUserId = this.scopeUserId(actor, userId);

    let range: { startDate: string; endDate: string };
    try {
      range = monthRange(month);
    } catch {
      throw new BadRequestException('month must be in YYYY-MM format');
    }

    const filters: any[] = [
      eq(attendanceRecords.tenantId, tenantId),
      gte(attendanceRecords.date, range.startDate),
      lte(attendanceRecords.date, range.endDate),
    ];
    if (scopedUserId) filters.push(eq(attendanceRecords.userId, scopedUserId));

    const records = await this.db
      .select()
      .from(attendanceRecords)
      .where(and(...filters))
      .orderBy(attendanceRecords.date);

    const totalWorkingMinutes = records.reduce((sum, r) => sum + (r.totalWorkingMinutes || 0), 0);
    const totalOvertimeMinutes = records.reduce((sum, r) => sum + (r.overtimeMinutes || 0), 0);
    // Average across days actually worked, not across every row — leave and week-off
    // rows would otherwise drag the average down.
    const workedDays = records.filter((r) => (r.totalWorkingMinutes || 0) > 0).length;

    return {
      month,
      startDate: range.startDate,
      endDate: range.endDate,
      userId: scopedUserId ?? null,
      totalDays: records.length,
      present: records.filter((r) => r.status === 'present').length,
      absent: records.filter((r) => r.status === 'absent').length,
      halfDay: records.filter((r) => r.status === 'half_day').length,
      onLeave: records.filter((r) => r.status === 'on_leave').length,
      holiday: records.filter((r) => r.status === 'holiday').length,
      weekOff: records.filter((r) => r.status === 'week_off').length,
      late: records.filter((r) => r.isLate).length,
      totalWorkingHours: (totalWorkingMinutes / 60).toFixed(1),
      totalOvertimeHours: (totalOvertimeMinutes / 60).toFixed(1),
      avgWorkingHours: workedDays > 0 ? (totalWorkingMinutes / workedDays / 60).toFixed(1) : '0',
      records,
    };
  }

  async getLiveMap(tenantId: string, actor: AttendanceActor) {
    this.assertAdmin(actor, 'view the live agent map');

    const openCheckIns = await this.db
      .select({
        checkIn: attendanceCheckIns,
        user: { id: users.id, name: users.name, email: users.email, phone: users.phone },
      })
      .from(attendanceCheckIns)
      .leftJoin(users, eq(attendanceCheckIns.userId, users.id))
      .where(and(eq(attendanceCheckIns.tenantId, tenantId), isNull(attendanceCheckIns.checkOutAt)))
      .orderBy(desc(attendanceCheckIns.checkInAt));

    if (openCheckIns.length === 0) return [];

    // One query for the newest ping of every open session, instead of one per agent.
    const checkInIds = openCheckIns.map((row) => row.checkIn.id);
    const latestPings = await this.db
      .selectDistinctOn([locationTrackingLogs.checkInId])
      .from(locationTrackingLogs)
      .where(inArray(locationTrackingLogs.checkInId, checkInIds))
      .orderBy(locationTrackingLogs.checkInId, desc(locationTrackingLogs.recordedAt));

    const pingByCheckIn = new Map(latestPings.map((p) => [p.checkInId, p]));

    return openCheckIns.map(({ checkIn, user }) => {
      const ping = pingByCheckIn.get(checkIn.id);
      return {
        userId: checkIn.userId,
        userName: user?.name ?? null,
        userEmail: user?.email ?? null,
        checkInId: checkIn.id,
        checkInAt: checkIn.checkInAt,
        locationType: checkIn.locationType,
        checkInLocation: checkIn.checkInAddress,
        currentLatitude: ping ? Number(ping.latitude) : Number(checkIn.checkInLatitude),
        currentLongitude: ping ? Number(ping.longitude) : Number(checkIn.checkInLongitude),
        lastPingAt: ping?.recordedAt ?? checkIn.checkInAt,
        batteryLevel: ping?.batteryLevel ?? null,
      };
    });
  }

  // ── Leave Management ─────────────────────────────────────────────────────

  /** Days a request consumes: half-day leave counts as 0.5 per calendar day. */
  private leaveDays(leaveType: LeaveTypeValue, startDate: string, endDate: string): number {
    const days = countDaysInclusive(startDate, endDate);
    return leaveType === 'half_day' ? days * 0.5 : days;
  }

  async createLeaveRequest(tenantId: string, actor: AttendanceActor, dto: CreateLeaveRequestDto) {
    // Only admins may file leave on someone else's behalf.
    let targetUserId = actor.userId;
    if (dto.userId && dto.userId !== actor.userId) {
      this.assertAdmin(actor, 'raise leave requests for other users');
      targetUserId = dto.userId;
    }

    const startDate = this.assertDate(dto.startDate, 'startDate');
    const endDate = this.assertDate(dto.endDate, 'endDate');

    if (endDate < startDate) {
      throw new BadRequestException('endDate cannot be earlier than startDate');
    }

    // Reject requests that collide with an existing pending or approved one.
    const [overlap] = await this.db
      .select({ id: leaveRequests.id, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.tenantId, tenantId),
          eq(leaveRequests.userId, targetUserId),
          inArray(leaveRequests.status, ['pending', 'approved']),
          lte(leaveRequests.startDate, endDate),
          gte(leaveRequests.endDate, startDate),
        ),
      )
      .limit(1);

    if (overlap) {
      throw new BadRequestException(
        `This overlaps an existing leave request (${overlap.startDate} to ${overlap.endDate})`,
      );
    }

    // Balance is only enforced when the tenant has actually allocated one for this
    // leave type and year — an unallocated type stays unrestricted.
    const requestedDays = this.leaveDays(dto.leaveType, startDate, endDate);
    if (!NON_DEDUCTING_LEAVE_TYPES.includes(dto.leaveType)) {
      const balance = await this.findLeaveBalance(
        tenantId,
        targetUserId,
        dto.leaveType,
        Number(startDate.slice(0, 4)),
      );
      if (balance && Number(balance.remaining) < requestedDays) {
        throw new BadRequestException(
          `Insufficient leave balance: ${balance.remaining} day(s) remaining, ${requestedDays} requested`,
        );
      }
    }

    const id = randomUUID();
    await this.db.insert(leaveRequests).values({
      id,
      tenantId,
      userId: targetUserId,
      leaveType: dto.leaveType,
      startDate,
      endDate,
      reason: dto.reason ?? null,
      status: 'pending',
      metadata: { requestedDays, createdByUserId: actor.userId },
    });

    const [req] = await this.db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
    return req;
  }

  async getLeaveRequests(tenantId: string, actor: AttendanceActor, query: LeaveRequestsQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);
    const scopedUserId = this.scopeUserId(actor, query.userId);

    const filters: any[] = [eq(leaveRequests.tenantId, tenantId)];
    if (scopedUserId) filters.push(eq(leaveRequests.userId, scopedUserId));
    if (query.status) filters.push(eq(leaveRequests.status, query.status));
    if (query.leaveType) filters.push(eq(leaveRequests.leaveType, query.leaveType));
    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      filters.push(or(ilike(users.name, term), ilike(users.email, term), ilike(leaveRequests.reason, term)));
    }

    const sortColumn =
      LEAVE_SORT_COLUMNS[query.sortBy as keyof typeof LEAVE_SORT_COLUMNS] ?? leaveRequests.createdAt;
    const orderBy = query.sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          request: leaveRequests,
          user: { id: users.id, name: users.name, email: users.email },
        })
        .from(leaveRequests)
        .leftJoin(users, eq(leaveRequests.userId, users.id))
        .where(and(...filters))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(leaveRequests)
        .leftJoin(users, eq(leaveRequests.userId, users.id))
        .where(and(...filters)),
    ]);

    const results = rows.map((r) => ({
      ...r.request,
      user: r.user,
      totalDays: this.leaveDays(r.request.leaveType, r.request.startDate, r.request.endDate),
    }));
    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(results, total, page, limit);
  }

  async reviewLeaveRequest(
    tenantId: string,
    leaveId: string,
    actor: AttendanceActor,
    dto: ReviewLeaveRequestDto,
  ) {
    this.assertAdmin(actor, 'review leave requests');

    const [req] = await this.db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.id, leaveId), eq(leaveRequests.tenantId, tenantId)))
      .limit(1);

    if (!req) throw new NotFoundException('Leave request not found');
    if (req.status !== 'pending') throw new BadRequestException('Leave request is no longer pending');
    if (req.userId === actor.userId) {
      throw new ForbiddenException('You cannot review your own leave request');
    }

    await this.db.update(leaveRequests).set({
      status: dto.status,
      reviewedByUserId: actor.userId,
      reviewedAt: new Date(),
      reviewerRemarks: dto.remarks ?? null,
      updatedAt: new Date(),
    }).where(eq(leaveRequests.id, leaveId));

    if (dto.status === 'approved') {
      await this.applyApprovedLeave(tenantId, req);
    }

    const [updated] = await this.db.select().from(leaveRequests).where(eq(leaveRequests.id, leaveId)).limit(1);
    return updated;
  }

  /**
   * Cancels a leave request. Owners may cancel while it is still pending;
   * admins may also cancel an approved one, which rolls back the attendance
   * rows and the consumed balance.
   */
  async cancelLeaveRequest(tenantId: string, leaveId: string, actor: AttendanceActor, reason?: string) {
    const [req] = await this.db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.id, leaveId), eq(leaveRequests.tenantId, tenantId)))
      .limit(1);

    if (!req) throw new NotFoundException('Leave request not found');
    if (!actor.isAdmin && req.userId !== actor.userId) {
      throw new ForbiddenException('You can only cancel your own leave requests');
    }
    if (req.status === 'cancelled') throw new BadRequestException('Leave request is already cancelled');
    if (req.status === 'rejected') throw new BadRequestException('A rejected leave request cannot be cancelled');
    if (req.status === 'approved' && !actor.isAdmin) {
      throw new ForbiddenException('Only an admin can cancel an approved leave request');
    }

    if (req.status === 'approved') {
      await this.revertApprovedLeave(tenantId, req);
    }

    await this.db.update(leaveRequests).set({
      status: 'cancelled',
      reviewerRemarks: reason ?? req.reviewerRemarks,
      metadata: {
        ...((req.metadata as Record<string, unknown>) || {}),
        cancelledAt: new Date().toISOString(),
        cancelledByUserId: actor.userId,
      },
      updatedAt: new Date(),
    }).where(eq(leaveRequests.id, leaveId));

    const [updated] = await this.db.select().from(leaveRequests).where(eq(leaveRequests.id, leaveId)).limit(1);
    return updated;
  }

  /** Marks every covered day as `on_leave` and deducts the balance. */
  private async applyApprovedLeave(tenantId: string, req: typeof leaveRequests.$inferSelect) {
    if (NON_DEDUCTING_LEAVE_TYPES.includes(req.leaveType)) {
      // Work-from-home is still a working day: no `on_leave` row, no deduction.
      return;
    }

    for (const dateStr of eachDateInRange(req.startDate, req.endDate)) {
      const record = await this.getOrCreateDailyRecord(tenantId, req.userId, dateStr, {
        status: 'on_leave',
        leaveRequestId: req.id,
      });

      if (record.status !== 'on_leave' || record.leaveRequestId !== req.id) {
        await this.db.update(attendanceRecords).set({
          status: 'on_leave',
          leaveRequestId: req.id,
          updatedAt: new Date(),
        }).where(eq(attendanceRecords.id, record.id));
      }
    }

    await this.adjustLeaveBalance(
      tenantId,
      req.userId,
      req.leaveType,
      Number(req.startDate.slice(0, 4)),
      this.leaveDays(req.leaveType, req.startDate, req.endDate),
    );
  }

  /** Undoes {@link applyApprovedLeave} when an approved request is cancelled. */
  private async revertApprovedLeave(tenantId: string, req: typeof leaveRequests.$inferSelect) {
    if (NON_DEDUCTING_LEAVE_TYPES.includes(req.leaveType)) return;

    const affected = await this.db
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.tenantId, tenantId),
          eq(attendanceRecords.userId, req.userId),
          eq(attendanceRecords.leaveRequestId, req.id),
        ),
      );

    for (const record of affected) {
      await this.db.update(attendanceRecords).set({
        status: 'absent',
        leaveRequestId: null,
        updatedAt: new Date(),
      }).where(eq(attendanceRecords.id, record.id));
      // Re-derive the status from any check-ins that day (an agent may have worked anyway).
      await this.recalculateDailyRecord(record.id);
    }

    await this.adjustLeaveBalance(
      tenantId,
      req.userId,
      req.leaveType,
      Number(req.startDate.slice(0, 4)),
      -this.leaveDays(req.leaveType, req.startDate, req.endDate),
    );
  }

  // ── Leave balances ───────────────────────────────────────────────────────

  private async findLeaveBalance(tenantId: string, userId: string, leaveType: LeaveTypeValue, year: number) {
    const [balance] = await this.db
      .select()
      .from(leaveBalances)
      .where(
        and(
          eq(leaveBalances.tenantId, tenantId),
          eq(leaveBalances.userId, userId),
          eq(leaveBalances.leaveType, leaveType),
          eq(leaveBalances.year, year),
        ),
      )
      .limit(1);
    return balance ?? null;
  }

  /**
   * Moves `days` from remaining into used (negative `days` gives it back).
   * No-ops when the tenant has not allocated a balance for that type/year.
   */
  private async adjustLeaveBalance(
    tenantId: string,
    userId: string,
    leaveType: LeaveTypeValue,
    year: number,
    days: number,
  ) {
    const balance = await this.findLeaveBalance(tenantId, userId, leaveType, year);
    if (!balance) return;

    const total = Number(balance.totalAllowed) + Number(balance.carriedOver ?? 0);
    const used = Math.max(0, Number(balance.used) + days);
    const remaining = Math.max(0, total - used);

    await this.db.update(leaveBalances).set({
      used: used.toFixed(1),
      remaining: remaining.toFixed(1),
      updatedAt: new Date(),
    }).where(eq(leaveBalances.id, balance.id));
  }

  async getLeaveBalances(tenantId: string, actor: AttendanceActor, userId?: string, year?: number) {
    const scopedUserId = this.scopeUserId(actor, userId) ?? actor.userId;
    const targetYear = year || new Date().getFullYear();

    return this.db
      .select()
      .from(leaveBalances)
      .where(
        and(
          eq(leaveBalances.tenantId, tenantId),
          eq(leaveBalances.userId, scopedUserId),
          eq(leaveBalances.year, targetYear),
        ),
      )
      .orderBy(leaveBalances.leaveType);
  }

  /** Allocates (or re-allocates) a user's yearly entitlement. Admin only. */
  async upsertLeaveBalance(tenantId: string, actor: AttendanceActor, dto: UpsertLeaveBalanceDto) {
    this.assertAdmin(actor, 'allocate leave balances');

    const existing = await this.findLeaveBalance(tenantId, dto.userId, dto.leaveType, dto.year);
    const carriedOver = dto.carriedOver ?? Number(existing?.carriedOver ?? 0);
    const used = Number(existing?.used ?? 0);
    const remaining = Math.max(0, dto.totalAllowed + carriedOver - used);

    if (existing) {
      await this.db.update(leaveBalances).set({
        totalAllowed: dto.totalAllowed.toFixed(1),
        carriedOver: carriedOver.toFixed(1),
        remaining: remaining.toFixed(1),
        updatedAt: new Date(),
      }).where(eq(leaveBalances.id, existing.id));
    } else {
      await this.db.insert(leaveBalances).values({
        id: randomUUID(),
        tenantId,
        userId: dto.userId,
        leaveType: dto.leaveType,
        year: dto.year,
        totalAllowed: dto.totalAllowed.toFixed(1),
        carriedOver: carriedOver.toFixed(1),
        used: used.toFixed(1),
        remaining: remaining.toFixed(1),
      });
    }

    return this.findLeaveBalance(tenantId, dto.userId, dto.leaveType, dto.year);
  }

  // ── Site-visit integration ───────────────────────────────────────────────

  /**
   * Records an attendance check-in for a field agent arriving at a site visit,
   * when the tenant has `siteVisitAutoAttendance` switched on.
   *
   * Never throws into the caller's flow — a site visit must still be recordable
   * when attendance is misconfigured.
   */
  async recordSiteVisitAttendance(params: {
    tenantId: string;
    userId: string;
    siteVisitId: string;
    latitude: number;
    longitude: number;
    address?: string | null;
    selfieUrl?: string | null;
  }): Promise<{ checkInId: string } | null> {
    try {
      const settings = await this.getSettings(params.tenantId);
      if (!settings.siteVisitAutoAttendance) return null;

      // An already-open session means the agent is on the clock: don't double-count.
      const openCheckIn = await this.getOpenCheckIn(params.tenantId, params.userId);
      if (openCheckIn) return null;

      const now = new Date();
      const dateStr = zonedDateStr(now, this.timezoneOf(settings));
      const { isLate, lateByMinutes } = this.computeLateness(now, settings);
      const match = await this.matchGeoFence(params.tenantId, params.latitude, params.longitude);

      const record = await this.getOrCreateDailyRecord(params.tenantId, params.userId, dateStr, {
        status: 'present',
        firstCheckInAt: now,
        isLate,
        lateByMinutes,
      });

      if (!record.firstCheckInAt) {
        await this.db.update(attendanceRecords).set({
          firstCheckInAt: now,
          isLate,
          lateByMinutes,
          updatedAt: new Date(),
        }).where(eq(attendanceRecords.id, record.id));
      }

      const checkInId = randomUUID();
      await this.db.insert(attendanceCheckIns).values({
        id: checkInId,
        tenantId: params.tenantId,
        userId: params.userId,
        attendanceRecordId: record.id,
        checkInAt: now,
        checkInLatitude: String(params.latitude),
        checkInLongitude: String(params.longitude),
        checkInLocationId: match?.locationId ?? null,
        checkInSelfieUrl: params.selfieUrl ?? null,
        checkInAddress: params.address ?? null,
        locationType: 'property_site',
        siteVisitId: params.siteVisitId,
      });

      return { checkInId };
    } catch (error) {
      this.logger.error(
        `Auto-attendance for site visit ${params.siteVisitId} failed: ${(error as Error).message}`,
      );
      return null;
    }
  }

  // ── Auto-checkout job ────────────────────────────────────────────────────

  /**
   * Closes sessions agents forgot to end.
   *
   * Runs every 10 minutes because tenants sit in different timezones and each one
   * has its own cutoff — a single nightly run would miss most of them. Sessions
   * left open from an earlier day are always closed, regardless of the cutoff.
   */
  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'attendance-auto-checkout' })
  async runAutoCheckout(): Promise<{ tenantsProcessed: number; sessionsClosed: number }> {
    let tenantsProcessed = 0;
    let sessionsClosed = 0;

    try {
      const tenantSettings = await this.db
        .select()
        .from(attendanceSettings)
        .where(eq(attendanceSettings.autoCheckoutEnabled, true));

      for (const settings of tenantSettings) {
        try {
          sessionsClosed += await this.autoCheckoutTenant(settings);
          tenantsProcessed += 1;
        } catch (error) {
          this.logger.error(
            `Auto-checkout failed for tenant ${settings.tenantId}: ${(error as Error).message}`,
          );
        }
      }

      if (sessionsClosed > 0) {
        this.logger.log(`Auto-checkout closed ${sessionsClosed} session(s) across ${tenantsProcessed} tenant(s)`);
      }
    } catch (error) {
      this.logger.error(`Auto-checkout job failed: ${(error as Error).message}`);
    }

    return { tenantsProcessed, sessionsClosed };
  }

  private async autoCheckoutTenant(
    settings: typeof attendanceSettings.$inferSelect,
  ): Promise<number> {
    const timezone = this.timezoneOf(settings);
    const now = new Date();
    const todayStr = zonedDateStr(now, timezone);
    const cutoffMinutes = parseClockTime(settings.autoCheckoutTime) ?? 21 * 60;
    const cutoffReachedToday = zonedMinutesOfDay(now, timezone) >= cutoffMinutes;

    // Today's cutoff instant; anything opened before it on an earlier day is stale.
    const todayCutoffAt = zonedTimeToUtc(todayStr, cutoffMinutes, timezone);

    const open = await this.db
      .select()
      .from(attendanceCheckIns)
      .where(
        and(
          eq(attendanceCheckIns.tenantId, settings.tenantId),
          isNull(attendanceCheckIns.checkOutAt),
          cutoffReachedToday
            ? lt(attendanceCheckIns.checkInAt, new Date())
            : lt(attendanceCheckIns.checkInAt, todayCutoffAt),
        ),
      );

    const affectedRecordIds = new Set<string>();
    let closed = 0;

    for (const checkIn of open) {
      const checkInDate = zonedDateStr(new Date(checkIn.checkInAt), timezone);
      const isStale = checkInDate < todayStr;

      if (!isStale && !cutoffReachedToday) continue;

      // Stale sessions are closed at their own day's cutoff, so a forgotten
      // check-out cannot inflate the total by days. A session that started after
      // that day's cutoff closes at its own start instead, so check-out is never
      // recorded as earlier than check-in.
      const checkInAt = new Date(checkIn.checkInAt);
      const cutoffAt = isStale ? zonedTimeToUtc(checkInDate, cutoffMinutes, timezone) : now;
      const checkOutAt = cutoffAt < checkInAt ? checkInAt : cutoffAt;
      const durationMinutes = Math.max(
        0,
        Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 60000),
      );

      await this.db.update(attendanceCheckIns).set({
        checkOutAt,
        durationMinutes,
        isAutoCheckout: true,
        checkOutAddress: 'Auto checkout',
      }).where(eq(attendanceCheckIns.id, checkIn.id));

      affectedRecordIds.add(checkIn.attendanceRecordId);
      closed += 1;
    }

    for (const recordId of affectedRecordIds) {
      await this.recalculateDailyRecord(recordId);
    }

    return closed;
  }

  /** Manual trigger for the same job, so an admin can unstick an agent immediately. */
  async triggerAutoCheckout(tenantId: string, actor: AttendanceActor) {
    this.assertAdmin(actor, 'run auto-checkout');
    const settings = await this.getSettings(tenantId);
    const sessionsClosed = await this.autoCheckoutTenant(settings);
    return { sessionsClosed };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private assertDate(value: string, field: string): string {
    if (!isValidDateStr(value)) {
      throw new BadRequestException(`${field} must be a valid calendar date in YYYY-MM-DD format`);
    }
    return value;
  }

  private async getOpenCheckIn(tenantId: string, userId: string) {
    const [open] = await this.db
      .select()
      .from(attendanceCheckIns)
      .where(
        and(
          eq(attendanceCheckIns.tenantId, tenantId),
          eq(attendanceCheckIns.userId, userId),
          isNull(attendanceCheckIns.checkOutAt),
        ),
      )
      .orderBy(desc(attendanceCheckIns.checkInAt))
      .limit(1);

    return open ?? null;
  }

  /**
   * Recomputes the day's totals from its check-ins.
   *
   * Status is only auto-derived for days the tenant has not pinned by hand —
   * an admin regularization, an approved leave, a holiday or a week-off all win
   * over whatever the clock says.
   */
  private async recalculateDailyRecord(recordId: string) {
    const [record] = await this.db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.id, recordId))
      .limit(1);
    if (!record) return;

    const checkIns = await this.db
      .select()
      .from(attendanceCheckIns)
      .where(eq(attendanceCheckIns.attendanceRecordId, recordId));

    let totalWorkingMinutes = 0;
    let totalFieldMinutes = 0;
    let totalOfficeMinutes = 0;
    let firstCheckIn: Date | null = null;
    let lastCheckOut: Date | null = null;

    for (const ci of checkIns) {
      const duration = ci.durationMinutes || 0;
      totalWorkingMinutes += duration;

      if (ci.locationType === 'office') totalOfficeMinutes += duration;
      else totalFieldMinutes += duration;

      const checkInAt = new Date(ci.checkInAt);
      if (!firstCheckIn || checkInAt < firstCheckIn) firstCheckIn = checkInAt;

      if (ci.checkOutAt) {
        const checkOutAt = new Date(ci.checkOutAt);
        if (!lastCheckOut || checkOutAt > lastCheckOut) lastCheckOut = checkOutAt;
      }
    }

    const settings = await this.getSettings(record.tenantId);
    const fullDayMinutes = (parseFloat(settings.fullDayThresholdHours || '8') || 8) * 60;
    const halfDayMinutes = (parseFloat(settings.halfDayThresholdHours || '4') || 4) * 60;

    const updateData: Partial<typeof attendanceRecords.$inferInsert> = {
      totalWorkingMinutes,
      totalFieldMinutes,
      totalOfficeMinutes,
      // Recomputed from scratch every time, so a correction can lower it again.
      overtimeMinutes: Math.max(0, Math.round(totalWorkingMinutes - fullDayMinutes)),
      updatedAt: new Date(),
    };

    if (firstCheckIn && !record.firstCheckInAt) updateData.firstCheckInAt = firstCheckIn;
    if (lastCheckOut) updateData.lastCheckOutAt = lastCheckOut;

    const isManuallyPinned =
      MANUAL_STATUSES.includes(record.status as AttendanceStatusValue) ||
      (record.metadata as Record<string, unknown> | null)?.regularized === true;

    if (!isManuallyPinned && totalWorkingMinutes > 0) {
      updateData.status = totalWorkingMinutes < halfDayMinutes ? 'half_day' : 'present';
    }

    await this.db.update(attendanceRecords).set(updateData).where(eq(attendanceRecords.id, recordId));
  }
}
