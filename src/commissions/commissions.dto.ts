import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min
} from 'class-validator';

import { BaseListQueryDto } from '../common/dto/base-list-query.dto';

export const commissionTypes = ['brokerage', 'channel_partner', 'referral', 'incentive'] as const;
export type CommissionType = (typeof commissionTypes)[number];

export const commissionStatuses = ['pending', 'approved', 'paid', 'cancelled'] as const;
export type CommissionStatus = (typeof commissionStatuses)[number];

export class CreateCommissionDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  dealId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  agentUserId!: string;

  @ApiProperty({ enum: commissionTypes })
  @IsEnum(commissionTypes)
  type!: CommissionType;

  @ApiPropertyOptional({ description: 'Commission percentage rate (up to 999.99)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  percentageRate?: number;

  @ApiPropertyOptional({ description: 'Fixed commission amount' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedAmount?: number;

  @ApiProperty({ description: 'Total commission amount' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCommissionDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  dealId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  agentUserId?: string;

  @ApiPropertyOptional({ enum: commissionTypes })
  @IsOptional()
  @IsEnum(commissionTypes)
  type?: CommissionType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  percentageRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @ApiPropertyOptional({ enum: commissionStatuses })
  @IsOptional()
  @IsEnum(commissionStatuses)
  status?: CommissionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CommissionListQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  agentUserId?: string;

  @ApiPropertyOptional({ enum: commissionStatuses })
  @IsOptional()
  @IsEnum(commissionStatuses)
  status?: CommissionStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  dealId?: string;
}

export class UpdateCommissionStatusDto {
  @ApiProperty({ enum: commissionStatuses })
  @IsEnum(commissionStatuses)
  status!: CommissionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
