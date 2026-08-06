import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { users } from './users.schema';
import { propertyEntities } from './properties.schema';
import { siteVisits } from './site-visits.schema';

// ── Enums ────────────────────────────────────────────────────────────────────

export const attendanceLocationTypeEnum = pgEnum('attendance_location_type', [
  'office',
  'property_site',
  'custom',
]);

export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present',
  'absent',
  'half_day',
  'on_leave',
  'holiday',
  'week_off',
]);

export const checkinLocationTypeEnum = pgEnum('attendance_checkin_location_type', [
  'office',
  'property_site',
  'field',
  'remote',
]);

export const leaveTypeEnum = pgEnum('leave_type', [
  'casual',
  'sick',
  'earned',
  'half_day',
  'work_from_home',
  'compensatory',
]);

export const leaveRequestStatusEnum = pgEnum('leave_request_status', [
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);

// ── Table 1: attendance_settings (tenant-level config) ───────────────────────

export const attendanceSettings = pgTable(
  'attendance_settings',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    defaultCheckInRadiusMeters: integer('default_check_in_radius_meters').notNull().default(200),
    // Defaults to false: check-in is rejected without a selfie when this is on, and
    // selfie capture is opt-in per tenant rather than assumed.
    requireSelfie: boolean('require_selfie').notNull().default(false),
    requireLocation: boolean('require_location').notNull().default(true),
    allowRemoteCheckIn: boolean('allow_remote_check_in').notNull().default(false),
    workingHours: jsonb('working_hours').$type<{
      start: string;
      end: string;
      timezone: string;
      workingDays: number[];
    }>(),
    lateThresholdMinutes: integer('late_threshold_minutes').default(15),
    halfDayThresholdHours: numeric('half_day_threshold_hours', { precision: 4, scale: 2 }).default('4'),
    fullDayThresholdHours: numeric('full_day_threshold_hours', { precision: 4, scale: 2 }).default('8'),
    autoCheckoutEnabled: boolean('auto_checkout_enabled').notNull().default(true),
    autoCheckoutTime: varchar('auto_checkout_time', { length: 5 }).default('21:00'),
    siteVisitAutoAttendance: boolean('site_visit_auto_attendance').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantUq: uniqueIndex('attendance_settings_tenant_uq').on(table.tenantId),
  }),
);

// ── Table 2: attendance_locations (geo-fenced zones) ─────────────────────────

export const attendanceLocations = pgTable(
  'attendance_locations',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: attendanceLocationTypeEnum('type').notNull(),
    latitude: numeric('latitude', { precision: 10, scale: 7 }).notNull(),
    longitude: numeric('longitude', { precision: 10, scale: 7 }).notNull(),
    radiusMeters: integer('radius_meters').notNull().default(200),
    address: varchar('address', { length: 500 }),
    propertyEntityId: varchar('property_entity_id', { length: 36 })
      .references(() => propertyEntities.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('attendance_locations_tenant_idx').on(table.tenantId),
    tenantTypeIdx: index('attendance_locations_tenant_type_idx').on(table.tenantId, table.type),
    tenantActiveIdx: index('attendance_locations_tenant_active_idx').on(table.tenantId, table.isActive),
    propertyIdx: index('attendance_locations_property_idx').on(table.propertyEntityId),
  }),
);

// ── Table 3: attendance_records (daily summary — one per user per day) ───────

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    userId: varchar('user_id', { length: 36 })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    date: date('date').notNull(),
    status: attendanceStatusEnum('status').notNull().default('present'),
    firstCheckInAt: timestamp('first_check_in_at', { withTimezone: true }),
    lastCheckOutAt: timestamp('last_check_out_at', { withTimezone: true }),
    totalWorkingMinutes: integer('total_working_minutes').default(0),
    totalFieldMinutes: integer('total_field_minutes').default(0),
    totalOfficeMinutes: integer('total_office_minutes').default(0),
    isLate: boolean('is_late').notNull().default(false),
    lateByMinutes: integer('late_by_minutes').default(0),
    overtimeMinutes: integer('overtime_minutes').default(0),
    leaveRequestId: varchar('leave_request_id', { length: 36 }),
    remarks: varchar('remarks', { length: 1000 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('attendance_records_tenant_idx').on(table.tenantId),
    tenantUserDateUq: uniqueIndex('attendance_records_tenant_user_date_uq').on(
      table.tenantId,
      table.userId,
      table.date,
    ),
    tenantDateIdx: index('attendance_records_tenant_date_idx').on(table.tenantId, table.date),
    tenantStatusIdx: index('attendance_records_tenant_status_idx').on(table.tenantId, table.status),
    userDateIdx: index('attendance_records_user_date_idx').on(table.userId, table.date),
  }),
);

// ── Table 4: attendance_check_ins (individual check-in/out events) ───────────

export const attendanceCheckIns = pgTable(
  'attendance_check_ins',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    userId: varchar('user_id', { length: 36 })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    attendanceRecordId: varchar('attendance_record_id', { length: 36 })
      .references(() => attendanceRecords.id, { onDelete: 'cascade' })
      .notNull(),
    checkInAt: timestamp('check_in_at', { withTimezone: true }).notNull(),
    checkOutAt: timestamp('check_out_at', { withTimezone: true }),
    checkInLatitude: numeric('check_in_latitude', { precision: 10, scale: 7 }),
    checkInLongitude: numeric('check_in_longitude', { precision: 10, scale: 7 }),
    checkOutLatitude: numeric('check_out_latitude', { precision: 10, scale: 7 }),
    checkOutLongitude: numeric('check_out_longitude', { precision: 10, scale: 7 }),
    checkInLocationId: varchar('check_in_location_id', { length: 36 })
      .references(() => attendanceLocations.id, { onDelete: 'set null' }),
    checkOutLocationId: varchar('check_out_location_id', { length: 36 })
      .references(() => attendanceLocations.id, { onDelete: 'set null' }),
    checkInSelfieUrl: varchar('check_in_selfie_url', { length: 2000 }),
    checkOutSelfieUrl: varchar('check_out_selfie_url', { length: 2000 }),
    checkInAddress: varchar('check_in_address', { length: 500 }),
    checkOutAddress: varchar('check_out_address', { length: 500 }),
    durationMinutes: integer('duration_minutes'),
    locationType: checkinLocationTypeEnum('location_type'),
    siteVisitId: varchar('site_visit_id', { length: 36 })
      .references(() => siteVisits.id, { onDelete: 'set null' }),
    deviceInfo: jsonb('device_info').$type<{
      platform?: string;
      userAgent?: string;
      appVersion?: string;
      deviceId?: string;
    }>(),
    isAutoCheckout: boolean('is_auto_checkout').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('attendance_check_ins_tenant_idx').on(table.tenantId),
    recordIdx: index('attendance_check_ins_record_idx').on(table.attendanceRecordId),
    tenantUserIdx: index('attendance_check_ins_tenant_user_idx').on(table.tenantId, table.userId),
    tenantCheckinTimeIdx: index('attendance_check_ins_tenant_checkin_time_idx').on(
      table.tenantId,
      table.checkInAt,
    ),
    siteVisitIdx: index('attendance_check_ins_site_visit_idx').on(table.siteVisitId),
  }),
);

// ── Table 5: location_tracking_logs (periodic GPS pings) ─────────────────────

export const locationTrackingLogs = pgTable(
  'location_tracking_logs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    userId: varchar('user_id', { length: 36 })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    checkInId: varchar('check_in_id', { length: 36 })
      .references(() => attendanceCheckIns.id, { onDelete: 'cascade' }),
    latitude: numeric('latitude', { precision: 10, scale: 7 }).notNull(),
    longitude: numeric('longitude', { precision: 10, scale: 7 }).notNull(),
    accuracyMeters: numeric('accuracy_meters', { precision: 8, scale: 2 }),
    batteryLevel: integer('battery_level'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantUserTimeIdx: index('location_tracking_tenant_user_time_idx').on(
      table.tenantId,
      table.userId,
      table.recordedAt,
    ),
    checkInIdx: index('location_tracking_checkin_idx').on(table.checkInId),
    tenantTimeIdx: index('location_tracking_tenant_time_idx').on(table.tenantId, table.recordedAt),
  }),
);

// ── Table 6: leave_requests ──────────────────────────────────────────────────

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    userId: varchar('user_id', { length: 36 })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    leaveType: leaveTypeEnum('leave_type').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    reason: varchar('reason', { length: 1000 }),
    status: leaveRequestStatusEnum('status').notNull().default('pending'),
    reviewedByUserId: varchar('reviewed_by_user_id', { length: 36 })
      .references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewerRemarks: varchar('reviewer_remarks', { length: 1000 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantIdx: index('leave_requests_tenant_idx').on(table.tenantId),
    tenantUserIdx: index('leave_requests_tenant_user_idx').on(table.tenantId, table.userId),
    tenantStatusIdx: index('leave_requests_tenant_status_idx').on(table.tenantId, table.status),
    tenantDatesIdx: index('leave_requests_tenant_dates_idx').on(
      table.tenantId,
      table.startDate,
      table.endDate,
    ),
  }),
);

// ── Table 7: leave_balances ──────────────────────────────────────────────────

export const leaveBalances = pgTable(
  'leave_balances',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    userId: varchar('user_id', { length: 36 })
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    leaveType: leaveTypeEnum('leave_type').notNull(),
    year: integer('year').notNull(),
    totalAllowed: numeric('total_allowed', { precision: 5, scale: 1 }).notNull().default('0'),
    used: numeric('used', { precision: 5, scale: 1 }).notNull().default('0'),
    remaining: numeric('remaining', { precision: 5, scale: 1 }).notNull().default('0'),
    carriedOver: numeric('carried_over', { precision: 5, scale: 1 }).default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantUserTypeYearUq: uniqueIndex('leave_balances_tenant_user_type_year_uq').on(
      table.tenantId,
      table.userId,
      table.leaveType,
      table.year,
    ),
    tenantIdx: index('leave_balances_tenant_idx').on(table.tenantId),
  }),
);
