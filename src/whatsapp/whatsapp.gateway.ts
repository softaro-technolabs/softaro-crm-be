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
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface AuthenticatedSocket extends Socket {
    userId: string;
    tenantId: string;
    userName: string;
}

@WebSocketGateway({
    cors: {
        origin: '*',
        credentials: true
    },
    namespace: '/whatsapp'
})
export class WhatsappGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server!: Server;

    private readonly logger = new Logger(WhatsappGateway.name);

    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService
    ) { }

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

            // Join tenant-level room
            client.join(`whatsapp:tenant:${authClient.tenantId}`);

            this.logger.log(`WhatsApp client connected: ${client.id} (user: ${authClient.userId}, tenant: ${authClient.tenantId})`);
        } catch (e) {
            const err = e as Error;
            this.logger.warn(`WhatsApp auth failed on connect: ${err?.message}`);
            client.emit('error', { message: 'Invalid or expired token' });
            client.disconnect(true);
        }
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`WhatsApp client disconnected: ${client.id}`);
    }

    @SubscribeMessage('join_lead_chat')
    handleJoinLeadChat(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { leadId: string }
    ) {
        if (!payload.leadId) {
            throw new WsException('leadId is required');
        }
        client.join(`whatsapp:lead:${payload.leadId}`);
        this.logger.debug(`User joined WhatsApp lead chat: ${payload.leadId}`);
        return { event: 'joined_lead_chat', data: { leadId: payload.leadId } };
    }

    @SubscribeMessage('leave_lead_chat')
    handleLeaveLeadChat(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { leadId: string }
    ) {
        client.leave(`whatsapp:lead:${payload.leadId}`);
        this.logger.debug(`User left WhatsApp lead chat: ${payload.leadId}`);
        return { event: 'left_lead_chat', data: { leadId: payload.leadId } };
    }

    /**
     * Broadcasts a new message to the tenant and the specific lead chat room
     */
    broadcastNewMessage(tenantId: string, leadId: string | null, message: any) {
        // Broadcast to the whole tenant for sidebar updates etc.
        this.server.to(`whatsapp:tenant:${tenantId}`).emit('whatsapp:new_message', message);

        // Broadcast to the specific lead chat room if anyone is watching it
        if (leadId) {
            this.server.to(`whatsapp:lead:${leadId}`).emit('whatsapp:new_message', message);
        }
    }
}
