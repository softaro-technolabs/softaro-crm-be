import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { BaseListQueryDto } from '../common/dto/base-list-query.dto';

// ── Check-in / Check-out ─────────────────────────────────────────────────────

export class CheckInDto {
  @ApiProperty({ example: 19.076 })
  @IsNumber()
  latitude!: number;

  @ApiProperty({ example: 72.8777 })
  @IsNumber()
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
  latitude!: number;

  @ApiProperty({ example: 72.8777 })
  @IsNumber()
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
  latitude!: number;

  @ApiProperty({ example: 72.8777 })
  @IsNumber()
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
    example: { start: '09:00', end: '18:00', timezone: 'Asia/Kolkata', workingDays: [1, 2, 3, 4, 5] },
  })
  @IsOptional()
  workingHours?: {
    start: string;
    end: string;
    timezone: string;
    workingDays: number[];
  };

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsNumber()
  lateThresholdMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  halfDayThresholdHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  fullDayThresholdHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoCheckoutEnabled?: boolean;

  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @IsString()
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

  @ApiProperty({ enum: ['office', 'property_site', 'custom'] })
  @IsEnum(['office', 'property_site', 'custom'])
  type!: 'office' | 'property_site' | 'custom';

  @ApiProperty({ example: 19.076 })
  @IsNumber()
  latitude!: number;

  @ApiProperty({ example: 72.8777 })
  @IsNumber()
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
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
  @IsString()
  date?: string;

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ enum: ['present', 'absent', 'half_day', 'on_leave', 'holiday', 'week_off'] })
  @IsOptional()
  @IsString()
  status?: string;
}

// ── Regularize ───────────────────────────────────────────────────────────────

export class RegularizeAttendanceDto {
  @ApiProperty({ enum: ['present', 'absent', 'half_day', 'on_leave', 'holiday', 'week_off'] })
  @IsEnum(['present', 'absent', 'half_day', 'on_leave', 'holiday', 'week_off'])
  status!: string;

  @ApiPropertyOptional({ example: 'Regularized — was working remotely' })
  @IsOptional()
  @IsString()
  remarks?: string;
}

// ── Leave Requests ───────────────────────────────────────────────────────────

export class CreateLeaveRequestDto {
  @ApiProperty({ enum: ['casual', 'sick', 'earned', 'half_day', 'work_from_home', 'compensatory'] })
  @IsEnum(['casual', 'sick', 'earned', 'half_day', 'work_from_home', 'compensatory'])
  leaveType!: string;

  @ApiProperty({ example: '2026-05-25' })
  @IsString()
  startDate!: string;

  @ApiProperty({ example: '2026-05-26' })
  @IsString()
  endDate!: string;

  @ApiPropertyOptional({ example: 'Family function' })
  @IsOptional()
  @IsString()
  reason?: string;
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

export class LeaveRequestsQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ enum: ['pending', 'approved', 'rejected', 'cancelled'] })
  @IsOptional()
  @IsString()
  status?: string;
}
