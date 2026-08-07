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

export const costHeads = [
  'base_price',
  'plc',
  'floor_rise',
  'parking',
  'club_membership',
  'maintenance',
  'infrastructure',
  'legal',
  'stamp_duty',
  'registration',
  'gst',
  'other'
] as const;
export type CostHead = (typeof costHeads)[number];

export const taxTreatments = ['agreement_value', 'gst_only', 'statutory'] as const;
export type TaxTreatment = (typeof taxTreatments)[number];

export class CostSheetItemDto {
  @ApiProperty({ enum: costHeads })
  @IsEnum(costHeads)
  head!: CostHead;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({
    enum: taxTreatments,
    description:
      'agreement_value = attracts GST and stamp duty; gst_only = GST but no stamp duty; statutory = is itself a tax and is never taxed again'
  })
  @IsEnum(taxTreatments)
  taxTreatment!: TaxTreatment;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ description: 'Absolute discount on this line, applied before tax' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ description: 'Rate for statutory lines (GST %, stamp duty %)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  percentage?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
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

  @ApiPropertyOptional({
    type: [CreateBookingMilestoneDto],
    description: 'Ignored when paymentPlanTemplateId is supplied'
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateBookingMilestoneDto)
  milestones?: CreateBookingMilestoneDto[];

  @ApiPropertyOptional({
    type: [CostSheetItemDto],
    description: "Omit to derive the cost sheet from the unit's price list"
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CostSheetItemDto)
  costSheetItems?: CostSheetItemDto[];

  @ApiPropertyOptional({ description: 'Expands a payment plan template into the milestone schedule' })
  @IsOptional()
  @IsString()
  paymentPlanTemplateId?: string;

  @ApiPropertyOptional({ description: 'Why a discount was given — recorded in the discount audit log' })
  @IsOptional()
  @IsString()
  discountReason?: string;
}

export class UpdateBookingDto extends PartialType(CreateBookingDto) {}

export class ReversePaymentDto {
  @ApiProperty({ description: 'Why the payment is being reversed (bounced cheque, refund…)' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class BookingPaymentQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bookingId?: string;
}
