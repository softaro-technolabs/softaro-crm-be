import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min
} from 'class-validator';

import { BaseListQueryDto } from '../common/dto/base-list-query.dto';

export const dealStatuses = [
  'active',
  'closed_won',
  'closed_lost',
  'cancelled',
  'pending_payment',
  'on_hold'
] as const;

export type DealStatus = (typeof dealStatuses)[number];

export class DealListQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional({ enum: dealStatuses })
  @IsOptional()
  @IsEnum(dealStatuses)
  status?: DealStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToUserId?: string;
}

export class CreateDealDto {
  @ApiProperty()
  @IsString()
  leadId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  propertyUnitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quotationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  receivedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedClosingDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ConvertLeadToDealDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  propertyUnitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quotationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  receivedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedClosingDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDealDto {
  @ApiPropertyOptional({ enum: dealStatuses })
  @IsOptional()
  @IsEnum(dealStatuses)
  status?: DealStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  propertyUnitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  receivedAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedClosingDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actualClosingDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
