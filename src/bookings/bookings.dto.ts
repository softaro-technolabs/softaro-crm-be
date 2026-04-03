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

export const bookingStatuses = ['draft', 'confirmed', 'cancelled', 'completed'] as const;
export type BookingStatus = (typeof bookingStatuses)[number];

export class BookingListQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional({ enum: bookingStatuses })
  @IsOptional()
  @IsEnum(bookingStatuses)
  status?: BookingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dealId?: string;
}

export class CreateBookingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dealId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  leadId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  propertyUnitId?: string;

  @ApiProperty()
  @IsDateString()
  bookingDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bookingAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @ApiPropertyOptional({ enum: bookingStatuses })
  @IsOptional()
  @IsEnum(bookingStatuses)
  status?: BookingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBookingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  bookingDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bookingAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  paidAmount?: number;

  @ApiPropertyOptional({ enum: bookingStatuses })
  @IsOptional()
  @IsEnum(bookingStatuses)
  status?: BookingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
