import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';

@Injectable()
export class WebPushService implements OnModuleInit {
    private readonly logger = new Logger(WebPushService.name);

    constructor(private readonly configService: ConfigService) { }

    onModuleInit() {
        const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
        const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
        const subject = this.configService.get<string>('VAPID_SUBJECT', 'mailto:support@softaro.io');

        if (publicKey && privateKey) {
            webpush.setVapidDetails(subject, publicKey, privateKey);
            this.logger.log('WebPush VAPID details configured');
        } else {
            this.logger.warn('WebPush VAPID keys are not configured. Push notifications will not be sent.');
        }
    }

    async sendNotification(subscription: any, payload: string): Promise<boolean> {
        try {
            await webpush.sendNotification(subscription, payload);
            return true;
        } catch (error: any) {
            if (error.statusCode === 404 || error.statusCode === 410) {
                this.logger.warn(`Push subscription has expired or is no longer valid: ${error.message}`);
                return false; // Should be removed from DB
            }
            this.logger.error(`Error sending web push notification: ${error.message}`, error.stack);
            return true; // Keep for now in case of transient error
        }
    }
}
