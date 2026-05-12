import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min
} from 'class-validator';

import { BaseListQueryDto } from '../common/dto/base-list-query.dto';

export const callDirections = ['inbound', 'outbound'] as const;
export type CallDirection = (typeof callDirections)[number];

export const callStatuses = ['completed', 'missed', 'no_answer', 'busy', 'failed'] as const;
export type CallStatus = (typeof callStatuses)[number];

export class CreateCallLogDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  agentUserId?: string;

  @ApiProperty({ enum: callDirections })
  @IsEnum(callDirections)
  direction!: CallDirection;

  @ApiProperty({ enum: callStatuses })
  @IsEnum(callStatuses)
  status!: CallStatus;

  @ApiProperty({ description: 'Originating phone number' })
  @IsString()
  fromNumber!: string;

  @ApiProperty({ description: 'Destination phone number' })
  @IsString()
  toNumber!: string;

  @ApiPropertyOptional({ description: 'Call duration in seconds' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  duration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recordingUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Provider call identifier (e.g. Exotel CallSid)' })
  @IsOptional()
  @IsString()
  callSid?: string;

  @ApiPropertyOptional({ description: 'Telephony provider name', example: 'exotel' })
  @IsOptional()
  @IsString()
  providerName?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 datetime string of call start' })
  @IsOptional()
  @IsString()
  startedAt?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 datetime string of call end' })
  @IsOptional()
  @IsString()
  endedAt?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CallLogListQueryDto extends BaseListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  agentUserId?: string;

  @ApiPropertyOptional({ enum: callDirections })
  @IsOptional()
  @IsEnum(callDirections)
  direction?: CallDirection;

  @ApiPropertyOptional({ enum: callStatuses })
  @IsOptional()
  @IsEnum(callStatuses)
  status?: CallStatus;
}

/**
 * Exotel webhook payload — all fields are optional strings as Exotel sends
 * them via form POST or query params.
 */
export class ExotelWebhookDto {
  @ApiPropertyOptional({ description: 'Exotel call identifier' })
  @IsOptional()
  @IsString()
  CallSid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  From?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  To?: string;

  @ApiPropertyOptional({ description: 'Exotel call status' })
  @IsOptional()
  @IsString()
  Status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  Direction?: string;

  @ApiPropertyOptional({ description: 'Call duration in seconds (string)' })
  @IsOptional()
  @IsString()
  Duration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  RecordingUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  StartTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  AnswerTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  EndTime?: string;
}
