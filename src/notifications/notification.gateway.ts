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
    private connectedUsers = new Map<string, string>(); // userId -> socketId

    handleConnection(client: Socket) {
        const userId = client.handshake.query.userId as string;
        const tenantId = client.handshake.query.tenantId as string;
        
        if (userId) {
            this.connectedUsers.set(userId, client.id);
            this.logger.log(`User ${userId} (socket ${client.id}) connected`);
            
            // Join a private room for this tenant
            if (tenantId) {
                client.join(`tenant:${tenantId}`);
                this.logger.log(`User ${userId} joined room: tenant:${tenantId}`);
            }
        }
    }

    handleDisconnect(client: Socket) {
        for (const [userId, socketId] of this.connectedUsers.entries()) {
            if (socketId === client.id) {
                this.connectedUsers.delete(userId);
                this.logger.log(`User ${userId} disconnected`);
                break;
            }
        }
    }

    sendNotificationToUser(userId: string, event: string, data: any) {
        const socketId = this.connectedUsers.get(userId);
        if (socketId) {
            this.server.to(socketId).emit(event, data);
        }
    }

    sendNotificationToTenant(tenantId: string, event: string, data: any) {
        this.server.to(`tenant:${tenantId}`).emit(event, data);
        this.logger.log(`Broadcasted ${event} to tenant ${tenantId}`);
    }
}
