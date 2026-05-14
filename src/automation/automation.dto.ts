import { IsString, IsOptional, IsBoolean, IsArray, IsInt, IsEnum, Min, Max, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export type AutomationTriggerEvent =
  | 'lead_created'
  | 'lead_status_changed'
  | 'no_contact_for_days'
  | 'site_visit_scheduled'
  | 'site_visit_done'
  | 'site_visit_no_show'
  | 'booking_created'
  | 'payment_received'
  | 'task_overdue';

export type AutomationActionType =
  | 'send_whatsapp'
  | 'send_email'
  | 'reassign_lead'
  | 'create_task'
  | 'update_lead_status'
  | 'send_notification'
  | 'generate_ai_whatsapp';   // AI-personalized WhatsApp — llama-3.1-8b-instant

export interface AutomationCondition {
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte';
  value: unknown;
}

export interface AutomationAction {
  type: AutomationActionType;
  config: Record<string, unknown>;
}

export class CreateAutomationRuleDto {
  @ApiProperty({ description: 'Display name for the rule' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Optional description of the rule purpose' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'The event that triggers this rule',
    enum: [
      'lead_created',
      'lead_status_changed',
      'no_contact_for_days',
      'site_visit_scheduled',
      'site_visit_done',
      'site_visit_no_show',
      'booking_created',
      'payment_received',
      'task_overdue'
    ]
  })
  @IsString()
  triggerEvent!: AutomationTriggerEvent;

  @ApiPropertyOptional({
    description: 'Array of conditions that must match for rule to fire',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        field: { type: 'string' },
        operator: { type: 'string', enum: ['eq', 'neq', 'contains', 'gt', 'lt', 'gte', 'lte'] },
        value: {}
      }
    }
  })
  @IsOptional()
  @IsArray()
  conditions?: AutomationCondition[];

  @ApiProperty({
    description: 'Array of actions to execute when rule matches',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['send_whatsapp', 'send_email', 'reassign_lead', 'create_task', 'update_lead_status', 'send_notification'] },
        config: { type: 'object' }
      }
    }
  })
  @IsArray()
  actions!: AutomationAction[];

  @ApiPropertyOptional({ description: 'Whether the rule is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Delay in hours before firing for time-based events', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  triggerDelayHours?: number;
}

export class UpdateAutomationRuleDto extends PartialType(CreateAutomationRuleDto) {}

export class AutomationListQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Filter by active state' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by trigger event' })
  @IsOptional()
  @IsString()
  triggerEvent?: AutomationTriggerEvent;
}

export class AutomationLogQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Filter by rule ID' })
  @IsOptional()
  @IsString()
  ruleId?: string;

  @ApiPropertyOptional({ description: 'Filter by lead ID' })
  @IsOptional()
  @IsString()
  leadId?: string;
}
