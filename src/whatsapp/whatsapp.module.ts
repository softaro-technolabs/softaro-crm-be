import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappAuthController } from './whatsapp-auth.controller';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappGateway } from './whatsapp.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [AuthModule],
    controllers: [WhatsappAuthController, WhatsappWebhookController, WhatsappController],
    providers: [WhatsappService, WhatsappGateway],
    exports: [WhatsappService, WhatsappGateway]
})
export class WhatsappModule { }
