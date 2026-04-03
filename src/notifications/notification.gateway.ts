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
        if (userId) {
            this.connectedUsers.set(userId, client.id);
            this.logger.log(`User ${userId} connected for notifications`);
        }
    }

    handleDisconnect(client: Socket) {
        // Remove the user from the map when they disconnect
        for (const [userId, socketId] of this.connectedUsers.entries()) {
            if (socketId === client.id) {
                this.connectedUsers.delete(userId);
                this.logger.log(`User ${userId} disconnected from notifications`);
                break;
            }
        }
    }

    sendNotificationToUser(userId: string, event: string, data: any) {
        const socketId = this.connectedUsers.get(userId);
        if (socketId) {
            this.server.to(socketId).emit(event, data);
            this.logger.log(`Sent ${event} to user ${userId}`);
        } else {
            this.logger.warn(`User ${userId} not online for notification ${event}`);
        }
    }
}
