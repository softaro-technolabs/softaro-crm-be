import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
