import { 
    WebSocketGateway, 
    WebSocketServer, 
    OnGatewayConnection, 
    OnGatewayDisconnect 
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
    namespace: 'notifications'
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server!: Server;

    private readonly logger = new Logger(NotificationGateway.name);
    // userId → Set of socketIds (supports multiple tabs / devices per user)
    private connectedUsers = new Map<string, Set<string>>();

    handleConnection(client: Socket) {
        const userId = client.handshake.query.userId as string;
        const tenantId = client.handshake.query.tenantId as string;

        if (userId) {
            if (!this.connectedUsers.has(userId)) {
                this.connectedUsers.set(userId, new Set());
            }
            this.connectedUsers.get(userId)!.add(client.id);
            this.logger.log(`User ${userId} (socket ${client.id}) connected`);

            if (tenantId) {
                client.join(`tenant:${tenantId}`);
                this.logger.log(`User ${userId} joined room: tenant:${tenantId}`);
            }
        }
    }

    handleDisconnect(client: Socket) {
        for (const [userId, socketIds] of this.connectedUsers.entries()) {
            if (socketIds.has(client.id)) {
                socketIds.delete(client.id);
                if (socketIds.size === 0) this.connectedUsers.delete(userId);
                this.logger.log(`User ${userId} (socket ${client.id}) disconnected`);
                break;
            }
        }
    }

    sendNotificationToUser(userId: string, event: string, data: any) {
        const socketIds = this.connectedUsers.get(userId);
        if (socketIds?.size) {
            socketIds.forEach((socketId) => this.server.to(socketId).emit(event, data));
        }
    }

    sendNotificationToTenant(tenantId: string, event: string, data: any) {
        this.server.to(`tenant:${tenantId}`).emit(event, data);
        this.logger.log(`Broadcasted ${event} to tenant ${tenantId}`);
    }
}
