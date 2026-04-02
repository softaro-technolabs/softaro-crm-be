import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

export enum QuotationStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  CONVERTED = 'converted'
}

export class QuotationItemDto {
  @ApiProperty({ description: 'Item description' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ description: 'Quantity', example: 1 })
  @IsNumber()
  quantity!: number;

  @ApiProperty({ description: 'Unit price', example: 100 })
  @IsNumber()
  unitPrice!: number;

  @ApiProperty({ description: 'Tax rate percentage', example: 18 })
  @IsNumber()
  @IsOptional()
  taxRate?: number;

  @ApiProperty({ description: 'Discount rate percentage', example: 0 })
  @IsNumber()
  @IsOptional()
  discountRate?: number;
}

export class CreateQuotationDto {
  @ApiProperty({ description: 'Lead ID' })
  @IsUUID()
  leadId!: string;

  @ApiProperty({ description: 'Quotation title' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ description: 'Expiry date' })
  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @ApiPropertyOptional({ description: 'Currency', default: 'INR' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: 'Terms and conditions' })
  @IsString()
  @IsOptional()
  terms?: string;

  @ApiPropertyOptional({ type: [QuotationItemDto] })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items?: QuotationItemDto[];

  @ApiPropertyOptional() @IsString() @IsOptional() projectName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() unitNumber?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() floorTower?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() unitType?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() carpetArea?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() superBuiltUp?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() possession?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() paymentPlan?: string;

  @ApiPropertyOptional() @IsNumber() @IsOptional() basePrice?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() plc?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() parking?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() clubMembership?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() gstRate?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() gstAmount?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() stampDuty?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() discount?: number;
  @ApiPropertyOptional() @IsArray() @IsOptional() otherCharges?: any[];
}

export class UpdateQuotationDto extends PartialType(CreateQuotationDto) {
  @ApiPropertyOptional({ enum: QuotationStatus })
  @IsEnum(QuotationStatus)
  @IsOptional()
  status?: QuotationStatus;
}

export class QuotationListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: QuotationStatus })
  @IsOptional()
  @IsEnum(QuotationStatus)
  status?: QuotationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 10;
}
