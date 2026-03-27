import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength
} from 'class-validator';

export const LEAD_TASK_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const;
export type LeadTaskStatus = (typeof LEAD_TASK_STATUSES)[number];

export const LEAD_TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type LeadTaskPriority = (typeof LEAD_TASK_PRIORITIES)[number];

export class CreateLeadTaskDto {
  @ApiProperty({ maxLength: 255, example: 'Call the lead and confirm budget' })
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000, example: 'Ask about preferred location and timeline.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: LEAD_TASK_PRIORITIES, default: 'medium', example: 'high' })
  @IsOptional()
  @IsIn(LEAD_TASK_PRIORITIES)
  priority?: LeadTaskPriority;

  @ApiPropertyOptional({
    description: 'ISO date-time when task is due',
    example: '2026-01-14T17:00:00.000Z'
  })
  @IsOptional()
  @IsString()
  dueAt?: string;

  @ApiPropertyOptional({
    description: 'ISO date-time reminder time (for notification systems later)',
    example: '2026-01-14T16:30:00.000Z'
  })
  @IsOptional()
  @IsString()
  reminderAt?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Assign task to a user', example: '1c7a85e8-f5f1-4f05-91e6-4ae3f04c1b0d' })
  @IsOptional()
  @IsUUID(4)
  assignedToUserId?: string;

  @ApiPropertyOptional({
    description: 'If true and dueAt is provided, set lead.nextFollowUpAt = dueAt',
    default: false,
    example: true
  })
  @IsOptional()
  @IsBoolean()
  syncToLeadNextFollowUp?: boolean;
}

export class UpdateLeadTaskDto {
  @ApiPropertyOptional({ maxLength: 255, example: 'Send brochure on WhatsApp' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: LEAD_TASK_PRIORITIES, example: 'urgent' })
  @IsOptional()
  @IsIn(LEAD_TASK_PRIORITIES)
  priority?: LeadTaskPriority;

  @ApiPropertyOptional({ enum: LEAD_TASK_STATUSES, example: 'in_progress' })
  @IsOptional()
  @IsIn(LEAD_TASK_STATUSES)
  status?: LeadTaskStatus;

  @ApiPropertyOptional({ description: 'ISO date-time when task is due' })
  @IsOptional()
  @IsString()
  dueAt?: string | null;

  @ApiPropertyOptional({ description: 'ISO date-time reminder time' })
  @IsOptional()
  @IsString()
  reminderAt?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID(4)
  assignedToUserId?: string | null;
}

import { BaseListQueryDto } from '../common/dto/base-list-query.dto';

export class LeadTaskListQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional({ enum: LEAD_TASK_STATUSES, example: 'open' })
  @IsOptional()
  @IsIn(LEAD_TASK_STATUSES)
  status?: LeadTaskStatus;

  @ApiPropertyOptional({ enum: LEAD_TASK_PRIORITIES, example: 'high' })
  @IsOptional()
  @IsIn(LEAD_TASK_PRIORITIES)
  priority?: LeadTaskPriority;

  @ApiPropertyOptional({ format: 'uuid', example: '1c7a85e8-f5f1-4f05-91e6-4ae3f04c1b0d' })
  @IsOptional()
  @IsUUID(4)
  assignedToUserId?: string;

  @ApiPropertyOptional({ default: false, example: false })
  @IsOptional()
  @IsBoolean()
  includeArchived?: boolean;

  @ApiPropertyOptional({
    enum: ['title', 'priority', 'status', 'dueAt', 'createdAt', 'updatedAt'],
    default: 'createdAt',
    description: 'Field to sort by',
    example: 'dueAt'
  })
  @IsOptional()
  @IsIn(['title', 'priority', 'status', 'dueAt', 'createdAt', 'updatedAt'])
  override sortBy?: 'title' | 'priority' | 'status' | 'dueAt' | 'createdAt' | 'updatedAt';
}

export class TenantTaskListQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID(4)
  assignedToUserId?: string;

  @ApiPropertyOptional({ enum: LEAD_TASK_STATUSES })
  @IsOptional()
  @IsIn(LEAD_TASK_STATUSES)
  status?: LeadTaskStatus;

  @ApiPropertyOptional({ description: 'Only due tasks (dueAt <= now). Default: false', default: false })
  @IsOptional()
  @IsBoolean()
  due?: boolean;

  @ApiPropertyOptional({ description: 'Only overdue tasks (dueAt < now). Default: false', default: false })
  @IsOptional()
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({ description: 'Max due window in hours (e.g. 24). Applies when due=true.', example: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(24 * 365)
  withinHours?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  includeArchived?: boolean;

  @ApiPropertyOptional({
    enum: ['title', 'priority', 'status', 'dueAt', 'createdAt', 'updatedAt'],
    default: 'createdAt',
    description: 'Field to sort by',
    example: 'dueAt'
  })
  @IsOptional()
  @IsIn(['title', 'priority', 'status', 'dueAt', 'createdAt', 'updatedAt'])
  override sortBy?: 'title' | 'priority' | 'status' | 'dueAt' | 'createdAt' | 'updatedAt';
}


