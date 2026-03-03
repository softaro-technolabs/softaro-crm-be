import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ChatModule } from '../chat/chat.module';
import { WebPushService } from './web-push.service';

@Module({
    imports: [ChatModule],
    controllers: [NotificationsController],
    providers: [NotificationsService, WebPushService],
    exports: [NotificationsService, WebPushService]
})
export class NotificationsModule { }
