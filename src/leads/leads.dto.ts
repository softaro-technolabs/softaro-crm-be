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
  Min
} from 'class-validator';
import { LocationPointDto } from './location-preference.dto';

export const LEAD_REQUIREMENT_TYPES = ['buy', 'rent', 'investment'] as const;
export type LeadRequirementType = (typeof LEAD_REQUIREMENT_TYPES)[number];

export const LEAD_SOURCES = ['facebook', 'google', 'referral', 'website', 'walk_in', 'other'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_ASSIGNMENT_STRATEGIES = ['round_robin', 'property_category', 'availability', 'location'] as const;
export type LeadAssignmentStrategy = (typeof LEAD_ASSIGNMENT_STRATEGIES)[number];

export class CreateLeadDto {
  @ApiProperty({ maxLength: 255, example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ maxLength: 50, example: '+1 9876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 255, example: 'john@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ minimum: 0, type: Number, example: 7500000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budget?: number;

  @ApiProperty({ enum: LEAD_REQUIREMENT_TYPES, example: 'buy' })
  @IsIn(LEAD_REQUIREMENT_TYPES)
  requirementType!: LeadRequirementType;

  @ApiPropertyOptional({ description: 'Eg. Apartment, Villa', maxLength: 120, example: 'Apartment' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  propertyType?: string;

  @ApiPropertyOptional({
    description: 'Eg. Residential, Commercial',
    maxLength: 120,
    example: 'Residential'
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  propertyCategory?: string;

  @ApiPropertyOptional({ description: 'E.g. 2BHK', maxLength: 50, example: '3BHK' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  bhkType?: string;

  @ApiPropertyOptional({ 
    oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/LocationPointDto' }],
    example: 'Indiranagar, Bangalore' 
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  locationPreference?: string | LocationPointDto;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, type: Number, example: 82 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  propertyMatchScore?: number;

  @ApiPropertyOptional({ enum: LEAD_SOURCES, default: 'website', example: 'facebook' })
  @IsOptional()
  @IsIn(LEAD_SOURCES)
  leadSource?: LeadSource;

  @ApiPropertyOptional({
    maxLength: 120,
    description: 'Specific capture channel e.g. Landing page form',
    example: 'LandingPage'
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  captureChannel?: string;

  @ApiPropertyOptional({ maxLength: 1000, example: 'Looking to close within 2 months.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ format: 'uuid', example: '1c7a85e8-f5f1-4f05-91e6-4ae3f04c1b0d' })
  @IsOptional()
  @IsUUID(4)
  assignedToUserId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Pipeline status ID',
    example: '2a9b0d26-1644-4c3f-8e01-2eb8a7f7240a'
  })
  @IsOptional()
  @IsUUID(4)
  statusId?: string;

  @ApiPropertyOptional({ default: true, example: true })
  @IsOptional()
  @IsBoolean()
  autoAssign?: boolean;
}

export class UpdateLeadDto {
  @ApiPropertyOptional({ maxLength: 255, example: 'Jane Smith' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ maxLength: 50, example: '+44 206555999' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 255, example: 'jane@corp.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ minimum: 0, type: Number, example: 55000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budget?: number;

  @ApiPropertyOptional({ enum: LEAD_REQUIREMENT_TYPES, example: 'rent' })
  @IsOptional()
  @IsIn(LEAD_REQUIREMENT_TYPES)
  requirementType?: LeadRequirementType;

  @ApiPropertyOptional({ maxLength: 120, example: 'Office Space' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  propertyType?: string;

  @ApiPropertyOptional({ maxLength: 120, example: 'Commercial' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  propertyCategory?: string;

  @ApiPropertyOptional({ maxLength: 50, example: 'Studio' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  bhkType?: string;

  @ApiPropertyOptional({ 
    oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/LocationPointDto' }],
    example: 'Downtown Dubai' 
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  locationPreference?: string | LocationPointDto;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, type: Number, example: 54 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  propertyMatchScore?: number;

  @ApiPropertyOptional({ enum: LEAD_SOURCES, example: 'referral' })
  @IsOptional()
  @IsIn(LEAD_SOURCES)
  leadSource?: LeadSource;

  @ApiPropertyOptional({ maxLength: 120, example: 'WalkInDesk' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  captureChannel?: string;

  @ApiPropertyOptional({ maxLength: 1000, example: 'Negotiations ongoing with finance team.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ format: 'uuid', example: '5c8b67a4-12bf-4aa4-86f8-739a9c5ad136' })
  @IsOptional()
  @IsUUID(4)
  assignedToUserId?: string;

  @ApiPropertyOptional({ format: 'uuid', example: '9fa08f2b-7a82-4c3c-8f94-723ab1b71923' })
  @IsOptional()
  @IsUUID(4)
  statusId?: string;
}

import { BaseListQueryDto } from '../common/dto/base-list-query.dto';

export class LeadListQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional({ format: 'uuid', example: '2a9b0d26-1644-4c3f-8e01-2eb8a7f7240a' })
  @IsOptional()
  @IsUUID(4)
  statusId?: string;

  @ApiPropertyOptional({ format: 'uuid', example: '1c7a85e8-f5f1-4f05-91e6-4ae3f04c1b0d' })
  @IsOptional()
  @IsUUID(4)
  assignedToUserId?: string;

  @ApiPropertyOptional({
    enum: ['name', 'email', 'phone', 'createdAt', 'updatedAt', 'budget', 'propertyMatchScore'],
    default: 'createdAt',
    description: 'Field to sort by',
    example: 'name'
  })
  @IsOptional()
  @IsIn(['name', 'email', 'phone', 'createdAt', 'updatedAt', 'budget', 'propertyMatchScore'])
  override sortBy?: 'name' | 'email' | 'phone' | 'createdAt' | 'updatedAt' | 'budget' | 'propertyMatchScore';
}

export class UpdateLeadStatusDto {
  @ApiProperty({ format: 'uuid', example: '3727d4a0-7af5-4f84-8ea8-a2c1f358fbf7' })
  @IsUUID(4)
  statusId!: string;

  @ApiPropertyOptional({ description: 'Absolute position index in Kanban column', example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  kanbanPosition?: number;
}

export class LeadTransferDto {
  @ApiProperty({ format: 'uuid', example: '54226e04-8950-4b6f-b852-cba518ff0c32' })
  @IsUUID(4)
  targetUserId!: string;

  @ApiPropertyOptional({ maxLength: 255, example: 'Agent on leave' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class CreateLeadStatusDto {
  @ApiProperty({ maxLength: 255, example: 'Site Visit Done' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ maxLength: 255, example: 'site_visit_done' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  slug!: string;

  @ApiPropertyOptional({ maxLength: 20, example: '#F97316' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFinal?: boolean;
}

export class ReorderLeadStatusesDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'uuid' },
    description: 'Ordered list of status IDs',
    example: [
      '2a9b0d26-1644-4c3f-8e01-2eb8a7f7240a',
      '3727d4a0-7af5-4f84-8ea8-a2c1f358fbf7'
    ]
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID(4, { each: true })
  statusIds!: string[];
}

export class UpdateLeadAssignmentSettingsDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  autoAssignEnabled?: boolean;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', enum: [...LEAD_ASSIGNMENT_STRATEGIES] },
    description: 'Ordered list of strategies to apply',
    example: ['availability', 'property_category', 'round_robin']
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(LEAD_ASSIGNMENT_STRATEGIES, { each: true })
  strategyOrder?: LeadAssignmentStrategy[];
}

export class UpsertLeadAssignmentAgentDto {
  @ApiProperty({ format: 'uuid', example: '1c7a85e8-f5f1-4f05-91e6-4ae3f04c1b0d' })
  @IsUUID(4)
  userId!: string;

  @ApiPropertyOptional({ default: true, example: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ minimum: 0, type: Number, example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxActiveLeads?: number;

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string' },
    maxItems: 20,
    description: 'Preferred property categories',
    example: ['Residential', 'Luxury']
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  categoryPreferences?: string[];

  @ApiPropertyOptional({
    type: 'array',
    items: { oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/LocationPointDto' }] },
    maxItems: 20,
    description: 'Preferred locations (strings or structured objects)',
    example: ['Bangalore', { name: 'Indiranagar', radiusKm: 5, latitude: 12.9716, longitude: 77.5946 }]
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  // We remove @IsString({ each: true }) to support objects
  locationPreferences?: (string | LocationPointDto)[];

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'string' },
    maxItems: 20,
    description: 'Preferred property types',
    example: ['Apartment', 'Villa']
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  propertyTypes?: string[];
}

export class PublicLeadCaptureDto {
  @ApiProperty({ maxLength: 255, example: 'Website Visitor' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ maxLength: 50, example: '+1 555 123 0000' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 255, example: 'visitor@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ minimum: 0, type: Number, example: 4800000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budget?: number;

  @ApiProperty({ enum: LEAD_REQUIREMENT_TYPES, example: 'investment' })
  @IsIn(LEAD_REQUIREMENT_TYPES)
  requirementType!: LeadRequirementType;

  @ApiPropertyOptional({ maxLength: 120, example: 'Retail Space' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  propertyType?: string;

  @ApiPropertyOptional({ maxLength: 120, example: 'Commercial' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  propertyCategory?: string;

  @ApiPropertyOptional({ 
    oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/LocationPointDto' }],
    example: 'Koramangala, Bangalore' 
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  locationPreference?: string | LocationPointDto;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, type: Number, example: 70 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  propertyMatchScore?: number;

  @ApiPropertyOptional({ enum: LEAD_SOURCES, example: 'google' })
  @IsOptional()
  @IsIn(LEAD_SOURCES)
  leadSource?: LeadSource;
}

export class BulkLeadImportResultDto {
  @ApiProperty()
  total!: number;
  @ApiProperty()
  created!: number;
  @ApiProperty()
  skipped!: number;
  @ApiProperty()
  failed!: number;
  @ApiProperty({ type: 'array', items: { type: 'object', properties: { row: { type: 'number' }, error: { type: 'string' } } } })
  errors!: { row: number; error: string }[];
}

export class UpdateAgentAvailabilityDto {
  @ApiProperty()
  @IsBoolean()
  isAvailable!: boolean;
}



