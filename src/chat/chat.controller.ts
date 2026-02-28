import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    Request,
    HttpCode,
    HttpStatus
} from '@nestjs/common';
import {
    ApiTags,
    ApiBearerAuth,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiQuery
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import {
    CreateConversationDto,
    SendMessageDto,
    UpdateGroupDto,
    AddMemberDto,
    MarkReadDto,
    MessagePaginationDto
} from './chat.dto';

@ApiTags('Chat')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
    constructor(
        private readonly chatService: ChatService,
        private readonly chatGateway: ChatGateway
    ) { }

    // ─── Conversations ─────────────────────────────────────
    @Post('conversations')
    @ApiOperation({ summary: 'Create a DM or group conversation' })
    @ApiResponse({ status: 201, description: 'Conversation created' })
    async createConversation(@Request() req: any, @Body() dto: CreateConversationDto) {
        const { sub: userId, tenant_id: tenantId } = req.user;
        return this.chatService.createConversation(tenantId, userId, dto);
    }

    @Get('conversations')
    @ApiOperation({ summary: 'List all conversations for current user' })
    async getConversations(@Request() req: any) {
        const { sub: userId, tenant_id: tenantId } = req.user;
        return this.chatService.getConversations(tenantId, userId);
    }

    @Get('conversations/:id')
    @ApiOperation({ summary: 'Get a single conversation by ID' })
    @ApiParam({ name: 'id', description: 'Conversation ID' })
    async getConversation(@Request() req: any, @Param('id') id: string) {
        const { sub: userId, tenant_id: tenantId } = req.user;
        return this.chatService.getConversationById(tenantId, userId, id);
    }

    @Patch('conversations/:id')
    @ApiOperation({ summary: 'Update a group conversation name/description' })
    @ApiParam({ name: 'id', description: 'Conversation ID' })
    async updateGroup(
        @Request() req: any,
        @Param('id') id: string,
        @Body() dto: UpdateGroupDto
    ) {
        const { sub: userId, tenant_id: tenantId } = req.user;
        return this.chatService.updateGroup(tenantId, userId, id, dto);
    }

    @Delete('conversations/:id')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Delete an entire conversation (DMs: any member, Groups: admins only)' })
    @ApiParam({ name: 'id', description: 'Conversation ID' })
    async deleteConversation(@Request() req: any, @Param('id') id: string) {
        const { sub: userId, tenant_id: tenantId } = req.user;
        const result = await this.chatService.deleteConversation(tenantId, userId, id);

        // Broadcast deletion event to tenant room so connected clients can update UI
        this.chatGateway.server.to(`tenant:${tenantId}`).emit('conversation_deleted', {
            conversationId: id,
            deletedByUserId: userId
        });

        return result;
    }

    // ─── Members ───────────────────────────────────────────
    @Post('conversations/:id/members')
    @ApiOperation({ summary: 'Add a member to a group conversation' })
    @ApiParam({ name: 'id', description: 'Conversation ID' })
    async addMember(
        @Request() req: any,
        @Param('id') id: string,
        @Body() dto: AddMemberDto
    ) {
        const { sub: userId, tenant_id: tenantId } = req.user;
        return this.chatService.addMember(tenantId, userId, id, dto);
    }

    @Delete('conversations/:id/members/:userId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Remove a member from a group conversation (admin only, or self-remove)' })
    @ApiParam({ name: 'id', description: 'Conversation ID' })
    @ApiParam({ name: 'userId', description: 'User ID to remove' })
    async removeMember(
        @Request() req: any,
        @Param('id') id: string,
        @Param('userId') targetUserId: string
    ) {
        const { sub: userId, tenant_id: tenantId } = req.user;
        return this.chatService.removeMember(tenantId, userId, id, targetUserId);
    }

    // ─── Messages ──────────────────────────────────────────
    @Get('conversations/:id/messages')
    @ApiOperation({ summary: 'Get paginated message history (newest first)' })
    @ApiParam({ name: 'id', description: 'Conversation ID' })
    @ApiQuery({ name: 'cursor', required: false, description: 'Message ID cursor for older messages' })
    @ApiQuery({ name: 'limit', required: false, description: 'Number of messages (max 100, default 50)' })
    async getMessages(
        @Request() req: any,
        @Param('id') id: string,
        @Query() query: MessagePaginationDto
    ) {
        const { sub: userId, tenant_id: tenantId } = req.user;
        const limit = query.limit ? parseInt(String(query.limit), 10) : 50;
        return this.chatService.getMessages(tenantId, userId, id, query.cursor, limit);
    }

    @Post('conversations/:id/messages')
    @ApiOperation({ summary: 'Send a message via REST (also triggers WebSocket event)' })
    @ApiParam({ name: 'id', description: 'Conversation ID' })
    async sendMessage(
        @Request() req: any,
        @Param('id') id: string,
        @Body() dto: SendMessageDto
    ) {
        const { sub: userId, tenant_id: tenantId } = req.user;
        const message = await this.chatService.sendMessage(tenantId, userId, id, dto);

        // Also broadcast via WebSocket so real-time clients get it
        this.chatGateway.broadcastNewMessage(id, message);

        return message;
    }

    @Post('conversations/:id/read')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Mark the conversation as read up to a specific message' })
    @ApiParam({ name: 'id', description: 'Conversation ID' })
    async markRead(
        @Request() req: any,
        @Param('id') id: string,
        @Body() dto: MarkReadDto
    ) {
        const { sub: userId, tenant_id: tenantId } = req.user;
        return this.chatService.markRead(tenantId, userId, id, dto.messageId);
    }

    @Delete('messages/:messageId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Soft-delete a message (sender or admin only)' })
    @ApiParam({ name: 'messageId', description: 'Message ID' })
    async deleteMessage(@Request() req: any, @Param('messageId') messageId: string) {
        const { sub: userId, tenant_id: tenantId } = req.user;
        return this.chatService.deleteMessage(tenantId, userId, messageId);
    }

    // ─── Presence ──────────────────────────────────────────
    @Get('online-status/:userId')
    @ApiOperation({ summary: 'Check if a user is currently online' })
    @ApiParam({ name: 'userId', description: 'User ID to check' })
    async getOnlineStatus(@Param('userId') userId: string) {
        return {
            userId,
            isOnline: this.chatGateway.isUserOnline(userId)
        };
    }
}
