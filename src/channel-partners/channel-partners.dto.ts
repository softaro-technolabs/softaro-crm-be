import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';

import { BaseListQueryDto } from '../common/dto/base-list-query.dto';

export const CHANNEL_PARTNER_STATUSES = ['pending', 'active', 'suspended'] as const;
export type ChannelPartnerStatus = (typeof CHANNEL_PARTNER_STATUSES)[number];

export const CP_USER_ROLES = ['cp_admin', 'cp_agent'] as const;
export type CpUserRole = (typeof CP_USER_ROLES)[number];

export const CP_INCENTIVE_STATUSES = ['accrued', 'approved', 'paid'] as const;
export type CpIncentiveStatus = (typeof CP_INCENTIVE_STATUSES)[number];

// ─── Channel Partner (internal) ───────────────────────────────────────────────
export class CreateChannelPartnerDto {
  @ApiProperty({ maxLength: 255, example: 'Rajesh Kumar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ maxLength: 255, example: 'Kumar Realty' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  firmName?: string;

  @ApiPropertyOptional({ maxLength: 50, example: '+919812345678' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 255, example: 'rajesh@kumarrealty.in' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ maxLength: 100, example: 'A51900001234' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reraRegNo?: string;

  @ApiPropertyOptional({ enum: CHANNEL_PARTNER_STATUSES, default: 'pending' })
  @IsOptional()
  @IsIn(CHANNEL_PARTNER_STATUSES)
  status?: ChannelPartnerStatus;

  @ApiPropertyOptional({ description: 'Commission % of deal value', example: 2, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercentage?: number;
}

export class UpdateChannelPartnerDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  firmName?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reraRegNo?: string;

  @ApiPropertyOptional({ enum: CHANNEL_PARTNER_STATUSES })
  @IsOptional()
  @IsIn(CHANNEL_PARTNER_STATUSES)
  status?: ChannelPartnerStatus;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercentage?: number;
}

export class ChannelPartnerListQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional({ enum: CHANNEL_PARTNER_STATUSES })
  @IsOptional()
  @IsIn(CHANNEL_PARTNER_STATUSES)
  status?: ChannelPartnerStatus;
}

// ─── CP portal accounts (internal creates them) ───────────────────────────────
export class CreateCpUserDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ minLength: 6, maxLength: 100, example: 'StrongPass1' })
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password!: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ enum: CP_USER_ROLES, default: 'cp_agent' })
  @IsOptional()
  @IsIn(CP_USER_ROLES)
  role?: CpUserRole;
}

// ─── Incentives (internal) ────────────────────────────────────────────────────
export class IncentiveListQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID(4)
  channelPartnerId?: string;

  @ApiPropertyOptional({ enum: CP_INCENTIVE_STATUSES })
  @IsOptional()
  @IsIn(CP_INCENTIVE_STATUSES)
  status?: CpIncentiveStatus;
}

// ─── CP portal DTOs ───────────────────────────────────────────────────────────
export class CpLoginDto {
  @ApiProperty({ example: 'agent@kumarrealty.in' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPass1' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required only if the same email exists across tenants' })
  @IsOptional()
  @IsUUID(4)
  tenantId?: string;
}

export class CpRegisterLeadDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ maxLength: 50, example: '+919800000000' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  phone!: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ maxLength: 120, example: 'buy', description: 'Requirement type' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  requirementType?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Unit the lead is interested in' })
  @IsOptional()
  @IsUUID(4)
  unitId?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CpInventoryQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by project/entity' })
  @IsOptional()
  @IsUUID(4)
  entityId?: string;
}
