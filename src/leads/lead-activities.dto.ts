import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength } from 'class-validator';

export const LEAD_ACTIVITY_TYPES = ['call', 'whatsapp', 'email', 'meeting', 'task', 'note', 'status_change'] as const;
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

const CONTACT_TYPES: LeadActivityType[] = ['call', 'whatsapp', 'email', 'meeting'];

export class CreateLeadActivityDto {
  @ApiProperty({ enum: LEAD_ACTIVITY_TYPES, example: 'call' })
  @IsIn(LEAD_ACTIVITY_TYPES)
  type!: LeadActivityType;

  @ApiPropertyOptional({ maxLength: 255, example: 'Call with lead' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000, example: 'Discussed budget and preferred location.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({
    description: 'ISO date-time. Defaults to now.',
    example: '2026-01-13T10:30:00.000Z'
  })
  @IsOptional()
  @IsString()
  happenedAt?: string;

  @ApiPropertyOptional({
    description: 'ISO date-time for next follow-up. If provided, updates lead.nextFollowUpAt.',
    example: '2026-01-14T10:30:00.000Z'
  })
  @IsOptional()
  @IsString()
  nextFollowUpAt?: string;

  @ApiPropertyOptional({
    description:
      'Whether this activity should mark the lead as contacted (updates lead.lastContactedAt). Defaults to true for call/whatsapp/email/meeting.',
    default: undefined,
    example: true
  })
  @IsOptional()
  @IsBoolean()
  markContacted?: boolean;

  static defaultMarkContacted(type: LeadActivityType) {
    return CONTACT_TYPES.includes(type);
  }
}

export class LeadActivityListQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 50, example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  limit?: number;

  @ApiPropertyOptional({ minimum: 1, default: 1, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page?: number;
}

export class LeadFollowUpsQueryDto {
  @ApiPropertyOptional({ format: 'uuid', example: '1c7a85e8-f5f1-4f05-91e6-4ae3f04c1b0d' })
  @IsOptional()
  @IsUUID(4)
  assignedToUserId?: string;

  @ApiPropertyOptional({ description: 'Search string applied to name/email/phone', example: 'john' })
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

  @ApiPropertyOptional({
    description: 'Only return follow-ups due on/before now (nextFollowUpAt <= now).',
    default: true,
    example: true
  })
  @IsOptional()
  @IsBoolean()
  due?: boolean;

  @ApiPropertyOptional({
    description: 'Only return overdue follow-ups (nextFollowUpAt < now). If true, overrides due.',
    default: false,
    example: false
  })
  @IsOptional()
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({
    description: 'Max follow-up window in hours from now (e.g. 24 = due within next 24h). Applies when due=true.',
    example: 24
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(24 * 365)
  withinHours?: number;
}




