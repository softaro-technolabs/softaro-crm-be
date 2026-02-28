import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ChatModule } from '../chat/chat.module'; // To use ChatGateway

@Module({
    imports: [ChatModule], // Required to inject ChatGateway into NotificationsService
    controllers: [NotificationsController],
    providers: [NotificationsService],
    exports: [NotificationsService] // Exported so LeadTasksService can use it
})
export class NotificationsModule { }
