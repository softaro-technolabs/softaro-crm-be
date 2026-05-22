import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, sql, desc, gte, lte, isNull } from 'drizzle-orm';
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
} from './attendance.dto';
import { PaginationUtil } from '../common/utils/pagination.util';

// ── Haversine formula: distance between two GPS points in meters ─────────────

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function todayDateStr(): string {
  return new Date().toISOString().split('T')[0];
}

@Injectable()
export class AttendanceService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  // ── Settings ─────────────────────────────────────────────────────────────

  async getSettings(tenantId: string) {
    const [existing] = await this.db
      .select()
      .from(attendanceSettings)
      .where(eq(attendanceSettings.tenantId, tenantId))
      .limit(1);

    if (existing) return existing;

    // Auto-create default settings for tenant
    const id = randomUUID();
    await this.db.insert(attendanceSettings).values({
      id,
      tenantId,
      workingHours: {
        start: '09:00',
        end: '18:00',
        timezone: 'Asia/Kolkata',
        workingDays: [1, 2, 3, 4, 5],
      },
    });

    const [created] = await this.db
      .select()
      .from(attendanceSettings)
      .where(eq(attendanceSettings.id, id))
      .limit(1);
    return created;
  }

  async updateSettings(tenantId: string, dto: UpdateAttendanceSettingsDto) {
    const settings = await this.getSettings(tenantId);

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

  async createLocation(tenantId: string, dto: CreateAttendanceLocationDto) {
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

  async updateLocation(tenantId: string, locationId: string, dto: UpdateAttendanceLocationDto) {
    const [loc] = await this.db
      .select()
      .from(attendanceLocations)
      .where(and(eq(attendanceLocations.id, locationId), eq(attendanceLocations.tenantId, tenantId)))
      .limit(1);

    if (!loc) throw new NotFoundException('Location not found');

    const updateData: Partial<typeof attendanceLocations.$inferInsert> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.latitude !== undefined) updateData.latitude = String(dto.latitude);
    if (dto.longitude !== undefined) updateData.longitude = String(dto.longitude);
    if (dto.radiusMeters !== undefined) updateData.radiusMeters = dto.radiusMeters;
    if (dto.address !== undefined) updateData.address = dto.address;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    updateData.updatedAt = new Date();

    await this.db.update(attendanceLocations).set(updateData).where(eq(attendanceLocations.id, locationId));

    const [updated] = await this.db.select().from(attendanceLocations).where(eq(attendanceLocations.id, locationId)).limit(1);
    return updated;
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

  // ── Check-in ─────────────────────────────────────────────────────────────

  async checkIn(tenantId: string, userId: string, dto: CheckInDto) {
    const settings = await this.getSettings(tenantId);
    const now = new Date();
    const dateStr = todayDateStr();

    // Validate: no open check-in already
    const openCheckIn = await this.getOpenCheckIn(tenantId, userId);
    if (openCheckIn) {
      throw new BadRequestException('Already checked in. Please check out first.');
    }

    // Geo-fence validation
    const match = await this.matchGeoFence(tenantId, dto.latitude, dto.longitude);
    if (!match && !settings.allowRemoteCheckIn) {
      throw new BadRequestException(
        'You are not within any registered location. Please move closer to check in.',
      );
    }

    // Get or create daily record
    let [record] = await this.db
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

    if (!record) {
      const recordId = randomUUID();

      // Check if late
      let isLate = false;
      let lateByMinutes = 0;
      if (settings.workingHours?.start) {
        const [h, m] = settings.workingHours.start.split(':').map(Number);
        const startTime = new Date(now);
        startTime.setHours(h, m + (settings.lateThresholdMinutes || 15), 0, 0);
        if (now > startTime) {
          isLate = true;
          lateByMinutes = Math.floor((now.getTime() - startTime.getTime()) / 60000);
        }
      }

      await this.db.insert(attendanceRecords).values({
        id: recordId,
        tenantId,
        userId,
        date: dateStr,
        status: 'present',
        firstCheckInAt: now,
        isLate,
        lateByMinutes,
      });

      [record] = await this.db.select().from(attendanceRecords).where(eq(attendanceRecords.id, recordId)).limit(1);
    }

    // Create check-in entry
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
      locationType: match?.locationType as any ?? 'field',
      deviceInfo: dto.deviceInfo ?? null,
    });

    return {
      checkInId,
      recordId: record.id,
      checkedInAt: now.toISOString(),
      location: match
        ? { name: match.locationName, type: match.locationType, distance: match.distance }
        : { name: 'Field / Remote', type: 'field', distance: null },
      isLate: record.isLate,
    };
  }

  // ── Check-out ────────────────────────────────────────────────────────────

  async checkOut(tenantId: string, userId: string, dto: CheckOutDto) {
    const now = new Date();

    const openCheckIn = await this.getOpenCheckIn(tenantId, userId);
    if (!openCheckIn) {
      throw new BadRequestException('No open check-in found. Please check in first.');
    }

    const match = await this.matchGeoFence(tenantId, dto.latitude, dto.longitude);

    // Compute duration
    const durationMinutes = Math.floor(
      (now.getTime() - new Date(openCheckIn.checkInAt).getTime()) / 60000,
    );

    // Update check-in record
    await this.db.update(attendanceCheckIns).set({
      checkOutAt: now,
      checkOutLatitude: String(dto.latitude),
      checkOutLongitude: String(dto.longitude),
      checkOutLocationId: match?.locationId ?? null,
      checkOutSelfieUrl: dto.selfieUrl ?? null,
      checkOutAddress: dto.address ?? null,
      durationMinutes,
    }).where(eq(attendanceCheckIns.id, openCheckIn.id));

    // Update daily record totals
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
    const dateStr = todayDateStr();

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
      isCheckedIn: !!openCheckIn,
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
      accuracyMeters: dto.accuracy ? String(dto.accuracy) : null,
      batteryLevel: dto.batteryLevel ?? null,
      recordedAt: new Date(),
    });

    return { success: true };
  }

  // ── Records (Admin) ──────────────────────────────────────────────────────

  async getRecords(tenantId: string, query: AttendanceRecordsQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const filters: any[] = [eq(attendanceRecords.tenantId, tenantId)];
    if (query.userId) filters.push(eq(attendanceRecords.userId, query.userId));
    if (query.date) filters.push(eq(attendanceRecords.date, query.date));
    if (query.startDate) filters.push(gte(attendanceRecords.date, query.startDate));
    if (query.endDate) filters.push(lte(attendanceRecords.date, query.endDate));
    if (query.status) filters.push(eq(attendanceRecords.status, query.status as any));

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          record: attendanceRecords,
          user: { id: users.id, name: users.name, email: users.email },
        })
        .from(attendanceRecords)
        .leftJoin(users, eq(attendanceRecords.userId, users.id))
        .where(and(...filters))
        .orderBy(desc(attendanceRecords.date))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(attendanceRecords)
        .where(and(...filters)),
    ]);

    const results = rows.map((r) => ({ ...r.record, user: r.user }));
    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(results, total, page, limit);
  }

  async getRecordDetail(tenantId: string, recordId: string) {
    const [row] = await this.db
      .select({
        record: attendanceRecords,
        user: { id: users.id, name: users.name, email: users.email },
      })
      .from(attendanceRecords)
      .leftJoin(users, eq(attendanceRecords.userId, users.id))
      .where(and(eq(attendanceRecords.id, recordId), eq(attendanceRecords.tenantId, tenantId)))
      .limit(1);

    if (!row) throw new NotFoundException('Record not found');

    const checkIns = await this.db
      .select()
      .from(attendanceCheckIns)
      .where(eq(attendanceCheckIns.attendanceRecordId, recordId))
      .orderBy(attendanceCheckIns.checkInAt);

    return { ...row.record, user: row.user, checkIns };
  }

  async regularizeRecord(tenantId: string, recordId: string, dto: RegularizeAttendanceDto) {
    const [record] = await this.db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.id, recordId), eq(attendanceRecords.tenantId, tenantId)))
      .limit(1);

    if (!record) throw new NotFoundException('Record not found');

    await this.db.update(attendanceRecords).set({
      status: dto.status as any,
      remarks: dto.remarks ?? record.remarks,
      metadata: { ...(record.metadata as any || {}), regularized: true, regularizedAt: new Date().toISOString() },
      updatedAt: new Date(),
    }).where(eq(attendanceRecords.id, recordId));

    return this.getRecordDetail(tenantId, recordId);
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  async getDailySummary(tenantId: string, dateStr: string) {
    const rows = await this.db
      .select({
        record: attendanceRecords,
        user: { id: users.id, name: users.name, email: users.email },
      })
      .from(attendanceRecords)
      .leftJoin(users, eq(attendanceRecords.userId, users.id))
      .where(and(eq(attendanceRecords.tenantId, tenantId), eq(attendanceRecords.date, dateStr)))
      .orderBy(attendanceRecords.date);

    const records = rows.map((r) => ({ ...r.record, user: r.user }));

    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const halfDay = records.filter(r => r.status === 'half_day').length;
    const onLeave = records.filter(r => r.status === 'on_leave').length;
    const late = records.filter(r => r.isLate).length;

    return { date: dateStr, total: records.length, present, absent, halfDay, onLeave, late, records };
  }

  async getLiveMap(tenantId: string) {
    // Get all currently checked-in users (open check-ins)
    const openCheckIns = await this.db
      .select()
      .from(attendanceCheckIns)
      .where(
        and(
          eq(attendanceCheckIns.tenantId, tenantId),
          isNull(attendanceCheckIns.checkOutAt),
        ),
      );

    // Collect unique user IDs and fetch their names in one query
    const userIds = [...new Set(openCheckIns.map((ci) => ci.userId))];
    const userRows = userIds.length
      ? await this.db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(sql`${users.id} = ANY(ARRAY[${sql.join(userIds.map((id) => sql`${id}`), sql`, `)}]::text[])`)
      : [];
    const userMap = Object.fromEntries(userRows.map((u) => [u.id, u]));

    // For each, get the latest location ping
    const agentLocations = await Promise.all(
      openCheckIns.map(async (ci) => {
        const [latestPing] = await this.db
          .select()
          .from(locationTrackingLogs)
          .where(eq(locationTrackingLogs.checkInId, ci.id))
          .orderBy(desc(locationTrackingLogs.recordedAt))
          .limit(1);

        const user = userMap[ci.userId];

        return {
          userId: ci.userId,
          userName: user?.name ?? null,
          userEmail: user?.email ?? null,
          checkInId: ci.id,
          checkInAt: ci.checkInAt,
          locationType: ci.locationType,
          checkInLocation: ci.checkInAddress,
          currentLatitude: latestPing ? Number(latestPing.latitude) : Number(ci.checkInLatitude),
          currentLongitude: latestPing ? Number(latestPing.longitude) : Number(ci.checkInLongitude),
          lastPingAt: latestPing?.recordedAt ?? ci.checkInAt,
          batteryLevel: latestPing?.batteryLevel,
        };
      }),
    );

    return agentLocations;
  }

  async getMonthlySummary(tenantId: string, month: string, userId?: string) {
    // month format: '2026-05'
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    const filters: any[] = [
      eq(attendanceRecords.tenantId, tenantId),
      gte(attendanceRecords.date, startDate),
      lte(attendanceRecords.date, endDate),
    ];
    if (userId) filters.push(eq(attendanceRecords.userId, userId));

    const records = await this.db
      .select()
      .from(attendanceRecords)
      .where(and(...filters))
      .orderBy(attendanceRecords.date);

    const totalPresent = records.filter(r => r.status === 'present').length;
    const totalAbsent = records.filter(r => r.status === 'absent').length;
    const totalHalfDay = records.filter(r => r.status === 'half_day').length;
    const totalOnLeave = records.filter(r => r.status === 'on_leave').length;
    const totalLate = records.filter(r => r.isLate).length;
    const totalWorkingMinutes = records.reduce((sum, r) => sum + (r.totalWorkingMinutes || 0), 0);
    const avgWorkingHours = records.length > 0 ? (totalWorkingMinutes / records.length / 60).toFixed(1) : '0';

    return {
      month,
      totalDays: records.length,
      present: totalPresent,
      absent: totalAbsent,
      halfDay: totalHalfDay,
      onLeave: totalOnLeave,
      late: totalLate,
      totalWorkingHours: (totalWorkingMinutes / 60).toFixed(1),
      avgWorkingHours,
      records,
    };
  }

  // ── Leave Management ─────────────────────────────────────────────────────

  async createLeaveRequest(tenantId: string, userId: string, dto: CreateLeaveRequestDto) {
    const id = randomUUID();
    await this.db.insert(leaveRequests).values({
      id,
      tenantId,
      userId,
      leaveType: dto.leaveType as any,
      startDate: dto.startDate,
      endDate: dto.endDate,
      reason: dto.reason ?? null,
      status: 'pending',
    });

    const [req] = await this.db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
    return req;
  }

  async getLeaveRequests(tenantId: string, query: LeaveRequestsQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const filters: any[] = [eq(leaveRequests.tenantId, tenantId)];
    if (query.userId) filters.push(eq(leaveRequests.userId, query.userId));
    if (query.status) filters.push(eq(leaveRequests.status, query.status as any));

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          request: leaveRequests,
          user: { id: users.id, name: users.name, email: users.email },
        })
        .from(leaveRequests)
        .leftJoin(users, eq(leaveRequests.userId, users.id))
        .where(and(...filters))
        .orderBy(desc(leaveRequests.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(leaveRequests)
        .where(and(...filters)),
    ]);

    const results = rows.map((r) => ({ ...r.request, user: r.user }));
    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(results, total, page, limit);
  }

  async reviewLeaveRequest(
    tenantId: string,
    leaveId: string,
    reviewerUserId: string,
    dto: ReviewLeaveRequestDto,
  ) {
    const [req] = await this.db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.id, leaveId), eq(leaveRequests.tenantId, tenantId)))
      .limit(1);

    if (!req) throw new NotFoundException('Leave request not found');
    if (req.status !== 'pending') throw new BadRequestException('Leave request is no longer pending');

    await this.db.update(leaveRequests).set({
      status: dto.status,
      reviewedByUserId: reviewerUserId,
      reviewedAt: new Date(),
      reviewerRemarks: dto.remarks ?? null,
      updatedAt: new Date(),
    }).where(eq(leaveRequests.id, leaveId));

    // If approved, mark attendance records as on_leave for the date range
    if (dto.status === 'approved') {
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const [existing] = await this.db
          .select()
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.tenantId, tenantId),
              eq(attendanceRecords.userId, req.userId),
              eq(attendanceRecords.date, dateStr),
            ),
          )
          .limit(1);

        if (existing) {
          await this.db.update(attendanceRecords).set({
            status: 'on_leave',
            leaveRequestId: leaveId,
            updatedAt: new Date(),
          }).where(eq(attendanceRecords.id, existing.id));
        } else {
          await this.db.insert(attendanceRecords).values({
            id: randomUUID(),
            tenantId,
            userId: req.userId,
            date: dateStr,
            status: 'on_leave',
            leaveRequestId: leaveId,
          });
        }
      }
    }

    const [updated] = await this.db.select().from(leaveRequests).where(eq(leaveRequests.id, leaveId)).limit(1);
    return updated;
  }

  async getLeaveBalances(tenantId: string, userId: string, year?: number) {
    const targetYear = year || new Date().getFullYear();
    return this.db
      .select()
      .from(leaveBalances)
      .where(
        and(
          eq(leaveBalances.tenantId, tenantId),
          eq(leaveBalances.userId, userId),
          eq(leaveBalances.year, targetYear),
        ),
      );
  }

  // ── Private helpers ──────────────────────────────────────────────────────

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

  private async recalculateDailyRecord(recordId: string) {
    const checkIns = await this.db
      .select()
      .from(attendanceCheckIns)
      .where(eq(attendanceCheckIns.attendanceRecordId, recordId));

    let totalWorkingMinutes = 0;
    let totalFieldMinutes = 0;
    let totalOfficeMinutes = 0;
    let lastCheckOut: Date | null = null;

    for (const ci of checkIns) {
      const duration = ci.durationMinutes || 0;
      totalWorkingMinutes += duration;

      if (ci.locationType === 'office') totalOfficeMinutes += duration;
      else totalFieldMinutes += duration;

      if (ci.checkOutAt && (!lastCheckOut || new Date(ci.checkOutAt) > lastCheckOut)) {
        lastCheckOut = new Date(ci.checkOutAt);
      }
    }

    const updateData: Partial<typeof attendanceRecords.$inferInsert> = {
      totalWorkingMinutes,
      totalFieldMinutes,
      totalOfficeMinutes,
      updatedAt: new Date(),
    };

    if (lastCheckOut) updateData.lastCheckOutAt = lastCheckOut;

    // Check for overtime
    const [record] = await this.db.select().from(attendanceRecords).where(eq(attendanceRecords.id, recordId)).limit(1);
    if (record) {
      const settings = await this.getSettings(record.tenantId);
      const fullDayMinutes = (parseFloat(settings.fullDayThresholdHours || '8') || 8) * 60;
      if (totalWorkingMinutes > fullDayMinutes) {
        updateData.overtimeMinutes = totalWorkingMinutes - Math.round(fullDayMinutes);
      }

      // Half-day check
      const halfDayMinutes = (parseFloat(settings.halfDayThresholdHours || '4') || 4) * 60;
      if (totalWorkingMinutes < halfDayMinutes && totalWorkingMinutes > 0) {
        updateData.status = 'half_day';
      }
    }

    await this.db.update(attendanceRecords).set(updateData).where(eq(attendanceRecords.id, recordId));
  }
}
