import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BaseListQueryDto } from '../common/dto/base-list-query.dto';

export const ATTENDANCE_STATUSES = [
  'present',
  'absent',
  'half_day',
  'on_leave',
  'holiday',
  'week_off',
] as const;
export type AttendanceStatusValue = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LOCATION_TYPES = ['office', 'property_site', 'custom'] as const;
export type AttendanceLocationTypeValue = (typeof ATTENDANCE_LOCATION_TYPES)[number];

export const LEAVE_TYPES = [
  'casual',
  'sick',
  'earned',
  'half_day',
  'work_from_home',
  'compensatory',
] as const;
export type LeaveTypeValue = (typeof LEAVE_TYPES)[number];

export const LEAVE_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type LeaveRequestStatusValue = (typeof LEAVE_REQUEST_STATUSES)[number];

/** `YYYY-MM-DD`. Calendar validity (e.g. rejecting 2026-02-31) is checked in the service. */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
/** `HH:mm`, 24-hour. */
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── Check-in / Check-out ─────────────────────────────────────────────────────

export class CheckInDto {
  @ApiProperty({ example: 19.076 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 72.8777 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ example: 'https://storage.example.com/selfie.jpg' })
  @IsOptional()
  @IsString()
  selfieUrl?: string;

  @ApiPropertyOptional({ example: '123 Main Road, Baner, Pune' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  deviceInfo?: {
    platform?: string;
    userAgent?: string;
    appVersion?: string;
    deviceId?: string;
  };
}

export class CheckOutDto {
  @ApiProperty({ example: 19.076 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 72.8777 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ example: 'https://storage.example.com/selfie.jpg' })
  @IsOptional()
  @IsString()
  selfieUrl?: string;

  @ApiPropertyOptional({ example: '123 Main Road, Baner, Pune' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  deviceInfo?: any;
}

export class LocationPingDto {
  @ApiProperty({ example: 19.076 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 72.8777 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ example: 15.5 })
  @IsOptional()
  @IsNumber()
  accuracy?: number;

  @ApiPropertyOptional({ example: 85 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  batteryLevel?: number;
}

// ── Attendance Settings ──────────────────────────────────────────────────────

export class WorkingHoursDto {
  @ApiProperty({ example: '09:00', description: 'Shift start, 24-hour HH:mm' })
  @IsString()
  @Matches(TIME_REGEX, { message: 'start must be a 24-hour time in HH:mm format' })
  start!: string;

  @ApiProperty({ example: '18:00', description: 'Shift end, 24-hour HH:mm' })
  @IsString()
  @Matches(TIME_REGEX, { message: 'end must be a 24-hour time in HH:mm format' })
  end!: string;

  @ApiProperty({ example: 'Asia/Kolkata', description: 'IANA timezone name' })
  @IsString()
  @MinLength(1)
  timezone!: string;

  @ApiProperty({ example: [1, 2, 3, 4, 5], description: 'Working days, 0 = Sunday' })
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  workingDays!: number[];
}

export class UpdateAttendanceSettingsDto {
  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(5000)
  defaultCheckInRadiusMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireSelfie?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireLocation?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowRemoteCheckIn?: boolean;

  @ApiPropertyOptional({
    type: WorkingHoursDto,
    example: { start: '09:00', end: '18:00', timezone: 'Asia/Kolkata', workingDays: [1, 2, 3, 4, 5] },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkingHoursDto)
  workingHours?: WorkingHoursDto;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  lateThresholdMinutes?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  halfDayThresholdHours?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  fullDayThresholdHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoCheckoutEnabled?: boolean;

  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'autoCheckoutTime must be a 24-hour time in HH:mm format' })
  autoCheckoutTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  siteVisitAutoAttendance?: boolean;
}

// ── Attendance Locations ─────────────────────────────────────────────────────

export class CreateAttendanceLocationDto {
  @ApiProperty({ example: 'Head Office' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ enum: ATTENDANCE_LOCATION_TYPES })
  @IsEnum(ATTENDANCE_LOCATION_TYPES)
  type!: AttendanceLocationTypeValue;

  @ApiProperty({ example: 19.076 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 72.8777 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ example: 200 })
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(5000)
  radiusMeters?: number;

  @ApiPropertyOptional({ example: '123 Main St, Pune' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Link to a property entity' })
  @IsOptional()
  @IsString()
  propertyEntityId?: string;
}

export class UpdateAttendanceLocationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ enum: ATTENDANCE_LOCATION_TYPES })
  @IsOptional()
  @IsEnum(ATTENDANCE_LOCATION_TYPES)
  type?: AttendanceLocationTypeValue;

  @ApiPropertyOptional({ description: 'Link to a property entity. Pass null to unlink.' })
  @IsOptional()
  @IsString()
  propertyEntityId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(5000)
  radiusMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ── Attendance Records Query ─────────────────────────────────────────────────

export class AttendanceRecordsQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ example: '2026-05-22' })
  @IsOptional()
  @Matches(DATE_REGEX, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsOptional()
  @Matches(DATE_REGEX, { message: 'startDate must be in YYYY-MM-DD format' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsOptional()
  @Matches(DATE_REGEX, { message: 'endDate must be in YYYY-MM-DD format' })
  endDate?: string;

  @ApiPropertyOptional({ enum: ATTENDANCE_STATUSES })
  @IsOptional()
  @IsEnum(ATTENDANCE_STATUSES)
  status?: AttendanceStatusValue;
}

// ── Regularize ───────────────────────────────────────────────────────────────

export class RegularizeAttendanceDto {
  @ApiProperty({ enum: ATTENDANCE_STATUSES })
  @IsEnum(ATTENDANCE_STATUSES)
  status!: AttendanceStatusValue;

  @ApiPropertyOptional({ example: 'Regularized — was working remotely' })
  @IsOptional()
  @IsString()
  remarks?: string;
}

// ── Leave Requests ───────────────────────────────────────────────────────────

export class CreateLeaveRequestDto {
  @ApiProperty({ enum: LEAVE_TYPES })
  @IsEnum(LEAVE_TYPES)
  leaveType!: LeaveTypeValue;

  @ApiProperty({ example: '2026-05-25' })
  @Matches(DATE_REGEX, { message: 'startDate must be in YYYY-MM-DD format' })
  startDate!: string;

  @ApiProperty({ example: '2026-05-26' })
  @Matches(DATE_REGEX, { message: 'endDate must be in YYYY-MM-DD format' })
  endDate!: string;

  @ApiPropertyOptional({ example: 'Family function' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Raise the request on behalf of another user. Admins only.',
  })
  @IsOptional()
  @IsString()
  userId?: string;
}

export class ReviewLeaveRequestDto {
  @ApiProperty({ enum: ['approved', 'rejected', 'cancelled'] })
  @IsEnum(['approved', 'rejected', 'cancelled'])
  status!: 'approved' | 'rejected' | 'cancelled';

  @ApiPropertyOptional({ example: 'Approved — please inform team' })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CancelLeaveRequestDto {
  @ApiPropertyOptional({ example: 'Plans changed' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class LeaveRequestsQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ enum: LEAVE_REQUEST_STATUSES })
  @IsOptional()
  @IsEnum(LEAVE_REQUEST_STATUSES)
  status?: LeaveRequestStatusValue;

  @ApiPropertyOptional({ enum: LEAVE_TYPES })
  @IsOptional()
  @IsEnum(LEAVE_TYPES)
  leaveType?: LeaveTypeValue;
}

// ── Team Attendance Report ───────────────────────────────────────────────────

export const REPORT_SORT_FIELDS = [
  'name',
  'presentDays',
  'absentDays',
  'halfDays',
  'leaveDays',
  'lateDays',
  'totalWorkingMinutes',
  'attendancePercentage',
] as const;
export type ReportSortField = (typeof REPORT_SORT_FIELDS)[number];

export class AttendanceReportQueryDto {
  @ApiPropertyOptional({ example: '2026-08-01', description: 'Range start. Defaults to the first of the current month.' })
  @IsOptional()
  @Matches(DATE_REGEX, { message: 'startDate must be in YYYY-MM-DD format' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'Range end. Defaults to today.' })
  @IsOptional()
  @Matches(DATE_REGEX, { message: 'endDate must be in YYYY-MM-DD format' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Shorthand for a whole month, e.g. 2026-08. Overrides startDate/endDate.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month?: string;

  @ApiPropertyOptional({ description: 'Restrict to a single user' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Search by agent name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Only include users who have at least one day with this status',
    enum: ATTENDANCE_STATUSES,
  })
  @IsOptional()
  @IsEnum(ATTENDANCE_STATUSES)
  status?: AttendanceStatusValue;

  @ApiPropertyOptional({ description: 'Only include users with at least one late arrival' })
  @IsOptional()
  @IsString()
  lateOnly?: string;

  @ApiPropertyOptional({ minimum: 1, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ enum: REPORT_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsEnum(REPORT_SORT_FIELDS)
  sortBy?: ReportSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}

// ── Leave Balances ───────────────────────────────────────────────────────────

export class UpsertLeaveBalanceDto {
  @ApiProperty({ description: 'User the balance belongs to' })
  @IsString()
  @MinLength(1)
  userId!: string;

  @ApiProperty({ enum: LEAVE_TYPES })
  @IsEnum(LEAVE_TYPES)
  leaveType!: LeaveTypeValue;

  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({ example: 12, description: 'Total days allowed for the year' })
  @IsNumber()
  @Min(0)
  @Max(999)
  totalAllowed!: number;

  @ApiPropertyOptional({ example: 2, description: 'Days carried over from last year' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999)
  carriedOver?: number;
}

// ── Geo-fence query (locations list) ─────────────────────────────────────────

export class AttendanceLocationsQueryDto {
  @ApiPropertyOptional({ enum: ATTENDANCE_LOCATION_TYPES })
  @IsOptional()
  @IsEnum(ATTENDANCE_LOCATION_TYPES)
  type?: AttendanceLocationTypeValue;

  @ApiPropertyOptional({ description: 'Pass "false" to include deactivated locations' })
  @IsOptional()
  @IsString()
  activeOnly?: string;
}
