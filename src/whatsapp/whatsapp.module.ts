import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappAuthController } from './whatsapp-auth.controller';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

@Module({
    controllers: [WhatsappAuthController, WhatsappWebhookController],
    providers: [WhatsappService],
    exports: [WhatsappService]
})
export class WhatsappModule { }
