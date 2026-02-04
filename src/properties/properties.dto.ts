import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';

export const PROPERTY_ENTITY_TYPES = ['project', 'building', 'plot', 'unit', 'land', 'villa'] as const;
export type PropertyEntityType = (typeof PROPERTY_ENTITY_TYPES)[number];

export const PROPERTY_ENTITY_STATUSES = ['active', 'inactive'] as const;
export type PropertyEntityStatus = (typeof PROPERTY_ENTITY_STATUSES)[number];

export const PROPERTY_UNIT_STATUSES = ['available', 'blocked', 'booked', 'sold'] as const;
export type PropertyUnitStatus = (typeof PROPERTY_UNIT_STATUSES)[number];

export const PROPERTY_ATTRIBUTE_DATA_TYPES = ['text', 'number', 'boolean', 'select'] as const;
export type PropertyAttributeDataType = (typeof PROPERTY_ATTRIBUTE_DATA_TYPES)[number];

export const PROPERTY_ATTRIBUTE_SCOPES = ['entity', 'unit'] as const;
export type PropertyAttributeScope = (typeof PROPERTY_ATTRIBUTE_SCOPES)[number];

export const PROPERTY_MEDIA_TYPES = ['image', 'pdf', 'video'] as const;
export type PropertyMediaType = (typeof PROPERTY_MEDIA_TYPES)[number];

export const LEAD_INTEREST_LEVELS = ['hot', 'warm', 'cold'] as const;
export type LeadInterestLevel = (typeof LEAD_INTEREST_LEVELS)[number];

export class UpsertPropertyLocationDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressLine?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  area?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  pincode?: string;

  @ApiPropertyOptional({ type: Number, example: 12.9716 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ type: Number, example: 77.5946 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}

export class PropertyEntityListQueryDto {
  @ApiPropertyOptional({ enum: PROPERTY_ENTITY_TYPES, example: 'project' })
  @IsOptional()
  @IsIn(PROPERTY_ENTITY_TYPES)
  entityType?: PropertyEntityType;

  @ApiPropertyOptional({ enum: PROPERTY_ENTITY_STATUSES, example: 'active' })
  @IsOptional()
  @IsIn(PROPERTY_ENTITY_STATUSES)
  status?: PropertyEntityStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by parent entity id', example: '6f1b11ff-9c36-4b43-9c99-6c8d1d7a4c83' })
  @IsOptional()
  @IsUUID(4)
  parentId?: string;

  @ApiPropertyOptional({ description: 'Only root entities (parent_id is null)', default: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  rootOnly?: boolean;

  @ApiPropertyOptional({ description: 'Search by name', example: 'Palm' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ minimum: 1, default: 50, example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  limit?: number;

  @ApiPropertyOptional({ minimum: 1, default: 1, example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page?: number;
}

export class CreatePropertyEntityDto {
  @ApiProperty({ enum: PROPERTY_ENTITY_TYPES, example: 'project' })
  @IsIn(PROPERTY_ENTITY_TYPES)
  entityType!: PropertyEntityType;

  @ApiPropertyOptional({ format: 'uuid', example: 'b222c4b3-cb0c-4bb0-9c50-3aa1a3b3b3b3' })
  @IsOptional()
  @IsUUID(4)
  parentId?: string;

  @ApiProperty({ maxLength: 255, example: 'Palm Meadows' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ enum: PROPERTY_ENTITY_STATUSES, default: 'active' })
  @IsOptional()
  @IsIn(PROPERTY_ENTITY_STATUSES)
  status?: PropertyEntityStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: 'Optional location info to create with entity', type: () => UpsertPropertyLocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertPropertyLocationDto)
  location?: UpsertPropertyLocationDto;

  @ApiPropertyOptional({ description: 'Optional attribute values', type: () => [UpsertAttributeValueItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertAttributeValueItemDto)
  attributes?: UpsertAttributeValueItemDto[];

  @ApiPropertyOptional({ description: 'Optional media items', type: () => [CreatePropertyMediaNestedDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePropertyMediaNestedDto)
  media?: CreatePropertyMediaNestedDto[];
}

export class UpdatePropertyEntityDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: PROPERTY_ENTITY_STATUSES })
  @IsOptional()
  @IsIn(PROPERTY_ENTITY_STATUSES)
  status?: PropertyEntityStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Re-parent entity (optional)' })
  @IsOptional()
  @IsUUID(4)
  parentId?: string;

  @ApiPropertyOptional({ description: 'Optional location info to upsert with entity', type: () => UpsertPropertyLocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertPropertyLocationDto)
  location?: UpsertPropertyLocationDto;
}

export class CreatePropertyUnitDto {
  @ApiProperty({ format: 'uuid', description: 'FK to property_entities.id', example: 'f61d2c3a-14b8-4b8c-9b7a-87a1a3f2d1aa' })
  @IsUUID(4)
  entityId!: string;

  @ApiProperty({ maxLength: 80, example: 'A-1204' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  unitCode!: string;

  @ApiPropertyOptional({ minimum: 0, type: Number, example: 9500000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ minimum: 0, type: Number, example: 12500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerSqft?: number;

  @ApiPropertyOptional({ enum: PROPERTY_UNIT_STATUSES, default: 'available' })
  @IsOptional()
  @IsIn(PROPERTY_UNIT_STATUSES)
  unitStatus?: PropertyUnitStatus;
}

export class PropertyUnitListQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by entity id', example: 'f61d2c3a-14b8-4b8c-9b7a-87a1a3f2d1aa' })
  @IsOptional()
  @IsUUID(4)
  entityId?: string;

  @ApiPropertyOptional({ enum: PROPERTY_UNIT_STATUSES, example: 'available' })
  @IsOptional()
  @IsIn(PROPERTY_UNIT_STATUSES)
  unitStatus?: PropertyUnitStatus;

  @ApiPropertyOptional({ description: 'Search by unit_code', example: '1204' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ minimum: 1, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  limit?: number;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page?: number;
}

export class UpdatePropertyUnitDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  unitCode?: string;

  @ApiPropertyOptional({ minimum: 0, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ minimum: 0, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerSqft?: number;

  @ApiPropertyOptional({ enum: PROPERTY_UNIT_STATUSES })
  @IsOptional()
  @IsIn(PROPERTY_UNIT_STATUSES)
  unitStatus?: PropertyUnitStatus;
}

export class UpdatePropertyUnitStatusDto {
  @ApiProperty({ enum: PROPERTY_UNIT_STATUSES, example: 'booked' })
  @IsIn(PROPERTY_UNIT_STATUSES)
  newStatus!: PropertyUnitStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}

export class CreatePropertyAttributeDto {
  @ApiProperty({ maxLength: 120, example: 'bedrooms' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: PROPERTY_ATTRIBUTE_DATA_TYPES, example: 'number' })
  @IsIn(PROPERTY_ATTRIBUTE_DATA_TYPES)
  dataType!: PropertyAttributeDataType;

  @ApiProperty({ enum: PROPERTY_ATTRIBUTE_SCOPES, example: 'unit' })
  @IsIn(PROPERTY_ATTRIBUTE_SCOPES)
  scope!: PropertyAttributeScope;
}

export class UpdatePropertyAttributeDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: PROPERTY_ATTRIBUTE_DATA_TYPES })
  @IsOptional()
  @IsIn(PROPERTY_ATTRIBUTE_DATA_TYPES)
  dataType?: PropertyAttributeDataType;

  @ApiPropertyOptional({ enum: PROPERTY_ATTRIBUTE_SCOPES })
  @IsOptional()
  @IsIn(PROPERTY_ATTRIBUTE_SCOPES)
  scope?: PropertyAttributeScope;
}

export class PropertyAttributeListQueryDto {
  @ApiPropertyOptional({ enum: PROPERTY_ATTRIBUTE_SCOPES })
  @IsOptional()
  @IsIn(PROPERTY_ATTRIBUTE_SCOPES)
  scope?: PropertyAttributeScope;
}

export class UpsertAttributeValueItemDto {
  @ApiProperty({ format: 'uuid', example: 'd3b07384-d9a3-41bb-9467-93c41123f99f' })
  @IsUUID(4)
  attributeId!: string;

  @ApiPropertyOptional({ description: 'If null/undefined, value will be deleted', example: 'East Facing' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  value?: string | null;
}

export class UpsertAttributeValuesDto {
  @ApiProperty({
    type: 'array',
    items: { $ref: '#/components/schemas/UpsertAttributeValueItemDto' },
    example: [
      { attributeId: 'd3b07384-d9a3-41bb-9467-93c41123f99f', value: 'East Facing' },
      { attributeId: 'a1b2c3d4-e5f6-7890-1234-567890abcdef', value: '3 BHK' }
    ]
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => UpsertAttributeValueItemDto)
  values!: UpsertAttributeValueItemDto[];
}

export class CreatePropertyMediaDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID(4)
  entityId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID(4)
  unitId?: string;

  @ApiProperty({ enum: PROPERTY_MEDIA_TYPES, example: 'image' })
  @IsIn(PROPERTY_MEDIA_TYPES)
  mediaType!: PropertyMediaType;

  @ApiProperty({ maxLength: 2000, example: 'https://cdn.example.com/file.jpg' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  fileUrl!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class CreatePropertyMediaNestedDto {
  @ApiProperty({ enum: PROPERTY_MEDIA_TYPES, example: 'image' })
  @IsIn(PROPERTY_MEDIA_TYPES)
  mediaType!: PropertyMediaType;

  @ApiProperty({ maxLength: 2000, example: 'https://cdn.example.com/file.jpg' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  fileUrl!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdatePropertyMediaDto {
  @ApiPropertyOptional({ enum: PROPERTY_MEDIA_TYPES })
  @IsOptional()
  @IsIn(PROPERTY_MEDIA_TYPES)
  mediaType?: PropertyMediaType;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  fileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class PropertyMediaListQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Entity id' })
  @IsUUID(4)
  entityId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Optional unit filter' })
  @IsOptional()
  @IsUUID(4)
  unitId?: string;
}

export class CreateLeadPropertyInterestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID(4)
  leadId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID(4)
  unitId!: string;

  @ApiPropertyOptional({ enum: LEAD_INTEREST_LEVELS, default: 'warm' })
  @IsOptional()
  @IsIn(LEAD_INTEREST_LEVELS)
  interestLevel?: LeadInterestLevel;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  visitDate?: Date;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  visitStatus?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateLeadPropertyInterestDto {
  @ApiPropertyOptional({ enum: LEAD_INTEREST_LEVELS })
  @IsOptional()
  @IsIn(LEAD_INTEREST_LEVELS)
  interestLevel?: LeadInterestLevel;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  visitDate?: Date | null;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  visitStatus?: string | null;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class LeadPropertyInterestListQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by lead id' })
  @IsOptional()
  @IsUUID(4)
  leadId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by unit id' })
  @IsOptional()
  @IsUUID(4)
  unitId?: string;

  @ApiPropertyOptional({ enum: LEAD_INTEREST_LEVELS })
  @IsOptional()
  @IsIn(LEAD_INTEREST_LEVELS)
  interestLevel?: LeadInterestLevel;

  @ApiPropertyOptional({ minimum: 1, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  limit?: number;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page?: number;
}

export class PricingBreakupItemDto {
  @ApiProperty({ maxLength: 120, example: 'base price' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label!: string;

  @ApiProperty({ minimum: 0, type: Number, example: 8000000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;
}

export class ReplacePricingBreakupsDto {
  @ApiProperty({ type: 'array', items: { $ref: '#/components/schemas/PricingBreakupItemDto' } })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ArrayUnique((i: PricingBreakupItemDto) => i.label)
  @ValidateNested({ each: true })
  @Type(() => PricingBreakupItemDto)
  items!: PricingBreakupItemDto[];
}

