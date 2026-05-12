import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BaseListQueryDto } from '../common/dto/base-list-query.dto';

export class OnboardTenantDto {
    @ApiProperty({ description: 'The authorization code received from Meta Embedded Signup' })
    @IsString()
    @IsNotEmpty()
    code!: string;
}

export class ConnectAccountDto {
    @ApiProperty({ description: 'Meta Business Account ID' })
    @IsString()
    @IsNotEmpty()
    businessAccountId!: string;

    @ApiProperty({ description: 'WhatsApp Phone Number ID' })
    @IsString()
    @IsNotEmpty()
    phoneNumberId!: string;

    @ApiProperty({ description: 'WhatsApp Phone Number' })
    @IsString()
    @IsNotEmpty()
    phoneNumber!: string;

    @ApiProperty({ description: 'WABA ID (WhatsApp Business Account ID)', required: false })
    @IsString()
    @IsOptional()
    wabaId?: string;

    @ApiProperty({ description: 'Permanent Access Token (System User Token)' })
    @IsString()
    @IsNotEmpty()
    permanentToken!: string;
}

export class SendMessageDto {
    @ApiProperty({ description: 'Lead ID', required: false })
    @IsString()
    @IsOptional()
    leadId?: string;

    @ApiProperty({ description: 'Contact Phone Number' })
    @IsString()
    @IsNotEmpty()
    contactPhone!: string;

    @ApiProperty({ description: 'Message Payload' })
    @IsNotEmpty()
    payload!: any;

    @ApiProperty({ description: 'Is message a template', required: false })
    @IsOptional()
    isTemplate?: boolean;
}

export class ScheduleMessageDto {
    @ApiProperty({ description: 'Lead ID', required: false })
    @IsString()
    @IsOptional()
    leadId?: string;

    @ApiProperty({ description: 'Contact Phone Number' })
    @IsString()
    @IsNotEmpty()
    contactPhone!: string;

    @ApiProperty({ description: 'Message Payload' })
    @IsNotEmpty()
    payload!: any;

    @ApiProperty({ description: 'Scheduled Time' })
    @IsNotEmpty()
    scheduledAt!: Date;

    @ApiProperty({ description: 'Is automated message', required: false })
    @IsOptional()
    isAutomated?: boolean;
}

export class MessageListQueryDto extends BaseListQueryDto {
    @ApiPropertyOptional({
        enum: ['createdAt', 'status'],
        default: 'createdAt',
        description: 'Field to sort by',
        example: 'createdAt'
    })
    @IsOptional()
    @IsIn(['createdAt', 'status'])
    override sortBy?: 'createdAt' | 'status';
}

// ── WhatsApp Template DTOs ──────────────────────────────────────────────────

export type TemplateCategoryType = 'marketing' | 'utility' | 'authentication';
export type TemplateStatusType = 'pending' | 'approved' | 'rejected' | 'disabled';

export class CreateWhatsappTemplateDto {
    @ApiProperty({ description: 'Template name as registered with Meta (snake_case, no spaces)', example: 'booking_confirmation' })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiProperty({ description: 'Human-readable display name', example: 'Booking Confirmation' })
    @IsString()
    @IsNotEmpty()
    displayName!: string;

    @ApiProperty({ enum: ['marketing', 'utility', 'authentication'], description: 'Template category' })
    @IsEnum(['marketing', 'utility', 'authentication'])
    category!: TemplateCategoryType;

    @ApiPropertyOptional({ description: 'Language code', example: 'en', default: 'en' })
    @IsOptional()
    @IsString()
    language?: string;

    @ApiPropertyOptional({ description: 'Header text (optional)', example: 'Payment Reminder' })
    @IsOptional()
    @IsString()
    headerText?: string;

    @ApiProperty({ description: 'Body text with variables like {{1}}, {{2}}', example: 'Dear {{1}}, your booking {{2}} is confirmed.' })
    @IsString()
    @IsNotEmpty()
    bodyText!: string;

    @ApiPropertyOptional({ description: 'Footer text (optional)', example: 'Powered by Softaro CRM' })
    @IsOptional()
    @IsString()
    footerText?: string;

    @ApiPropertyOptional({
        type: [String],
        description: 'Variable descriptions, e.g. ["{{1}} = Customer Name", "{{2}} = Booking Number"]',
        example: ['{{1}} = Customer Name', '{{2}} = Booking Number']
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    variables?: string[];

    @ApiPropertyOptional({ description: 'WhatsApp account ID to associate this template with', format: 'uuid' })
    @IsOptional()
    @IsUUID()
    whatsappAccountId?: string;
}

export class UpdateWhatsappTemplateDto extends PartialType(CreateWhatsappTemplateDto) {
    @ApiPropertyOptional({ description: 'Whether the template is active' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class WhatsappTemplateListQueryDto extends BaseListQueryDto {
    @ApiPropertyOptional({ enum: ['pending', 'approved', 'rejected', 'disabled'], description: 'Filter by template status' })
    @IsOptional()
    @IsEnum(['pending', 'approved', 'rejected', 'disabled'])
    status?: TemplateStatusType;

    @ApiPropertyOptional({ enum: ['marketing', 'utility', 'authentication'], description: 'Filter by template category' })
    @IsOptional()
    @IsEnum(['marketing', 'utility', 'authentication'])
    category?: TemplateCategoryType;
}
