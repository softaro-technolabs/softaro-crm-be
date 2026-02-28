import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    ConnectedSocket,
    MessageBody,
    WsException
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { ChatService } from './chat.service';
import type {
    JoinLeavePayload,
    MarkReadPayload,
    TypingPayload,
    MessageReadBroadcast
} from './chat.types';
import { SendMessageDto } from './chat.dto';

interface AuthenticatedSocket extends Socket {
    userId: string;
    tenantId: string;
    userName: string;
}

interface WsSendMessagePayload {
    conversationId: string;
    content: string;
    replyToMessageId?: string;
}

@WebSocketGateway({
    cors: {
        origin: '*',
        credentials: true
    },
    namespace: '/chat'
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server!: Server;

    private readonly logger = new Logger(ChatGateway.name);

    // Track online users: userId -> Set<socketId>
    private onlineUsers = new Map<string, Set<string>>();

    constructor(
        private readonly chatService: ChatService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService
    ) { }

    // ─── Connection ────────────────────────────────────────
    async handleConnection(client: Socket) {
        try {
            const token =
                (client.handshake.auth?.token as string) ||
                (client.handshake.headers?.authorization as string)?.replace('Bearer ', '') ||
                (client.handshake.query?.token as string);

            if (!token) {
                this.logger.warn(`Connection rejected — no token: ${client.id}`);
                client.emit('error', { message: 'Authentication required' });
                client.disconnect(true);
                return;
            }

            const payload = await this.jwtService.verifyAsync(token, {
                secret: this.configService.get<string>('jwt.secret')
            });

            if (!payload?.sub || !payload?.tenant_id) {
                client.emit('error', { message: 'Invalid token' });
                client.disconnect(true);
                return;
            }

            const authClient = client as AuthenticatedSocket;
            authClient.userId = payload.sub;
            authClient.tenantId = payload.tenant_id;
            authClient.userName = payload.name ?? 'Unknown';

            // Track online presence
            if (!this.onlineUsers.has(authClient.userId)) {
                this.onlineUsers.set(authClient.userId, new Set());
            }
            this.onlineUsers.get(authClient.userId)!.add(client.id);

            // Broadcast to tenant room that user came online
            if (this.onlineUsers.get(authClient.userId)?.size === 1) {
                this.server.to(`tenant:${authClient.tenantId}`).emit('user_online', {
                    userId: authClient.userId
                });
            }

            // Join tenant-level room
            client.join(`tenant:${authClient.tenantId}`);

            // Join user-level room for personal notifications
            client.join(`user:${authClient.userId}`);

            this.logger.log(`Client connected: ${client.id} (user: ${authClient.userId})`);
        } catch (e) {
            const err = e as Error;
            this.logger.warn(`Auth failed on connect: ${err?.message}`);
            client.emit('error', { message: 'Invalid or expired token' });
            client.disconnect(true);
        }
    }

    handleDisconnect(client: Socket) {
        const authClient = client as AuthenticatedSocket;
        if (!authClient.userId) return;

        const sockets = this.onlineUsers.get(authClient.userId);
        if (sockets) {
            sockets.delete(client.id);
            if (sockets.size === 0) {
                this.onlineUsers.delete(authClient.userId);
                // Broadcast offline to tenant
                this.server.to(`tenant:${authClient.tenantId}`).emit('user_offline', {
                    userId: authClient.userId
                });
            }
        }

        this.logger.log(`Client disconnected: ${client.id} (user: ${authClient.userId})`);
    }

    // ─── Join Conversation ─────────────────────────────────
    @SubscribeMessage('join_conversation')
    async handleJoinConversation(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: JoinLeavePayload
    ) {
        const authClient = client as AuthenticatedSocket;
        if (!authClient.userId) throw new WsException('Not authenticated');

        const isMember = await this.chatService.isMember(
            payload.conversationId,
            authClient.userId,
            authClient.tenantId
        );

        if (!isMember) {
            client.emit('error', { message: 'You are not a member of this conversation' });
            return;
        }

        client.join(`conv:${payload.conversationId}`);
        this.logger.debug(`User ${authClient.userId} joined conv:${payload.conversationId}`);

        return { event: 'joined_conversation', data: { conversationId: payload.conversationId } };
    }

    // ─── Leave Conversation ────────────────────────────────
    @SubscribeMessage('leave_conversation')
    handleLeaveConversation(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: JoinLeavePayload
    ) {
        client.leave(`conv:${payload.conversationId}`);
        return { event: 'left_conversation', data: { conversationId: payload.conversationId } };
    }

    // ─── Send Message ──────────────────────────────────────
    @SubscribeMessage('send_message')
    async handleSendMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: WsSendMessagePayload
    ) {
        const authClient = client as AuthenticatedSocket;
        if (!authClient.userId) throw new WsException('Not authenticated');

        if (!payload.conversationId || !payload.content?.trim()) {
            client.emit('error', { message: 'conversationId and content are required' });
            return;
        }

        try {
            const dto: SendMessageDto = {
                content: payload.content,
                replyToMessageId: payload.replyToMessageId
            };

            const message = await this.chatService.sendMessage(
                authClient.tenantId,
                authClient.userId,
                payload.conversationId,
                dto
            );

            // Broadcast to all members in the conversation room
            this.server.to(`conv:${payload.conversationId}`).emit('new_message', message);

            // Also notify off-room tenant members so they can update unread counts
            this.server.to(`tenant:${authClient.tenantId}`).emit('conversation_updated', {
                conversationId: payload.conversationId,
                lastMessagePreview: message.content.slice(0, 100),
                lastMessageAt: message.createdAt,
                senderId: authClient.userId
            });

            return { event: 'message_sent', data: message };
        } catch (e) {
            const err = e as Error;
            this.logger.error(`Error sending message: ${err?.message}`);
            client.emit('error', { message: err?.message ?? 'Failed to send message' });
        }
    }

    // ─── Typing Start ──────────────────────────────────────
    @SubscribeMessage('typing_start')
    handleTypingStart(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { conversationId: string }
    ) {
        const authClient = client as AuthenticatedSocket;
        if (!authClient.userId) return;

        const data: TypingPayload = {
            conversationId: payload.conversationId,
            userId: authClient.userId,
            userName: authClient.userName
        };

        // Broadcast to others in the room (not the sender)
        client.to(`conv:${payload.conversationId}`).emit('user_typing', data);
    }

    // ─── Typing Stop ───────────────────────────────────────
    @SubscribeMessage('typing_stop')
    handleTypingStop(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { conversationId: string }
    ) {
        const authClient = client as AuthenticatedSocket;
        if (!authClient.userId) return;

        client.to(`conv:${payload.conversationId}`).emit('user_stopped_typing', {
            conversationId: payload.conversationId,
            userId: authClient.userId
        });
    }

    // ─── Mark Read ─────────────────────────────────────────
    @SubscribeMessage('mark_read')
    async handleMarkRead(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: MarkReadPayload
    ) {
        const authClient = client as AuthenticatedSocket;
        if (!authClient.userId) throw new WsException('Not authenticated');

        try {
            const result = await this.chatService.markRead(
                authClient.tenantId,
                authClient.userId,
                payload.conversationId,
                payload.messageId
            );

            const broadcast: MessageReadBroadcast = {
                conversationId: payload.conversationId,
                userId: authClient.userId,
                messageId: payload.messageId,
                readAt: result.readAt
            };

            // Notify others in room that this user read up to this message
            client.to(`conv:${payload.conversationId}`).emit('message_read', broadcast);

            return { event: 'read_confirmed', data: result };
        } catch (e) {
            const err = e as Error;
            client.emit('error', { message: err?.message ?? 'Failed to mark as read' });
        }
    }

    // ─── Get Online Users ──────────────────────────────────
    @SubscribeMessage('get_online_users')
    handleGetOnlineUsers(@ConnectedSocket() client: Socket) {
        const authClient = client as AuthenticatedSocket;
        if (!authClient.userId) return;

        const onlineUserIds = Array.from(this.onlineUsers.keys());
        return { event: 'online_users', data: { userIds: onlineUserIds } };
    }

    // ─── Public helper for controller ─────────────────────
    broadcastNewMessage(conversationId: string, message: any) {
        this.server.to(`conv:${conversationId}`).emit('new_message', message);
    }

    isUserOnline(userId: string): boolean {
        return this.onlineUsers.has(userId) && (this.onlineUsers.get(userId)?.size ?? 0) > 0;
    }
}
