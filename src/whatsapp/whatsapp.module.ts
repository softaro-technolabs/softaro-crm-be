import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappAuthController } from './whatsapp-auth.controller';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappController } from './whatsapp.controller';

@Module({
    controllers: [WhatsappAuthController, WhatsappWebhookController, WhatsappController],
    providers: [WhatsappService],
    exports: [WhatsappService]
})
export class WhatsappModule { }
