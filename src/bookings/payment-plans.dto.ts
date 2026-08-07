import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested
} from 'class-validator';

export class PaymentPlanItemDto {
  @ApiProperty({ example: 'On booking' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiPropertyOptional({
    description: 'Percentage of the cost-sheet total. Percentages across a plan must sum to 100.'
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;

  @ApiPropertyOptional({ description: 'Fixed amount, used instead of a percentage' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedAmount?: number;

  @ApiPropertyOptional({
    description: 'Days after the booking date this instalment falls due (time-linked plans)'
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  dueOffsetDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class CreatePaymentPlanDto {
  @ApiProperty({ example: 'Construction Linked Plan' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Project this plan belongs to. Omit for a tenant-wide default.' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Only one default per project scope' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({ type: [PaymentPlanItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentPlanItemDto)
  items!: PaymentPlanItemDto[];
}

export class UpdatePaymentPlanDto extends PartialType(CreatePaymentPlanDto) {}
