import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsNotEmpty,
    IsArray,
    IsOptional,
    IsEnum,
    MinLength,
    MaxLength,
    ArrayMinSize
} from 'class-validator';

// ─── Create Conversation ────────────────────────────────
export class CreateConversationDto {
    @ApiProperty({ enum: ['direct', 'group'], description: 'Conversation type' })
    @IsEnum(['direct', 'group'])
    type!: 'direct' | 'group';

    @ApiPropertyOptional({ description: 'Group name (required for group type)' })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    name?: string;

    @ApiPropertyOptional({ description: 'Group description' })
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;

    @ApiProperty({ description: 'User IDs to add to the conversation (exclude self)', type: [String] })
    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(1)
    memberUserIds!: string[];
}

// ─── Send Message ───────────────────────────────────────
export class SendMessageDto {
    @ApiProperty({ description: 'Message content', maxLength: 10000 })
    @IsString()
    @IsNotEmpty()
    @MinLength(1)
    @MaxLength(10000)
    content!: string;

    @ApiPropertyOptional({ description: 'ID of the message being replied to' })
    @IsOptional()
    @IsString()
    replyToMessageId?: string;
}

// ─── Update Group ────────────────────────────────────────
export class UpdateGroupDto {
    @ApiPropertyOptional({ description: 'New group name' })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    name?: string;

    @ApiPropertyOptional({ description: 'Group description' })
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    description?: string;
}

// ─── Add Member ──────────────────────────────────────────
export class AddMemberDto {
    @ApiProperty({ description: 'User ID to add to the group' })
    @IsString()
    @IsNotEmpty()
    userId!: string;
}

// ─── Mark Read ───────────────────────────────────────────
export class MarkReadDto {
    @ApiProperty({ description: 'ID of the last message read' })
    @IsString()
    @IsNotEmpty()
    messageId!: string;
}

// ─── Pagination ──────────────────────────────────────────
export class MessagePaginationDto {
    @ApiPropertyOptional({ description: 'Cursor (message ID) for pagination', type: String })
    @IsOptional()
    @IsString()
    cursor?: string;

    @ApiPropertyOptional({ description: 'Number of messages to fetch (default 50)', default: 50 })
    @IsOptional()
    limit?: number;
}
