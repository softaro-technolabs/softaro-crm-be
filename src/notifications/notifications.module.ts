import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ChatModule } from '../chat/chat.module';
import { WebPushService } from './web-push.service';
import { NotificationGateway } from './notification.gateway';

@Module({
    imports: [ChatModule],
    controllers: [NotificationsController],
    providers: [NotificationsService, WebPushService, NotificationGateway],
    exports: [NotificationsService, WebPushService, NotificationGateway]
})
export class NotificationsModule { }
