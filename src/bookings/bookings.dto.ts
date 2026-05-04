import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested
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

export class CreateBookingMilestoneDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  percentage?: number;

  @ApiProperty()
  @IsNumber()
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class CreateBookingPaymentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  milestoneId?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiProperty()
  @IsDateString()
  paymentDate!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  paymentMethod!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transactionReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  quotationId?: string;

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

  @ApiPropertyOptional({ type: [CreateBookingMilestoneDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateBookingMilestoneDto)
  milestones?: CreateBookingMilestoneDto[];
}

export class UpdateBookingDto extends PartialType(CreateBookingDto) {}

export class BookingPaymentQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bookingId?: string;
}
