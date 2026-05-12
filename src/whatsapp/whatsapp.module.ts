import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappAuthController } from './whatsapp-auth.controller';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappTemplatesController } from './whatsapp-templates.controller';
import { WhatsappTemplatesService } from './whatsapp-templates.service';
import { AuthModule } from '../auth/auth.module';
import { LeadsModule } from '../leads/leads.module';

@Module({
    imports: [AuthModule, LeadsModule],
    controllers: [
        WhatsappAuthController,
        WhatsappWebhookController,
        WhatsappController,
        WhatsappTemplatesController,
    ],
    providers: [WhatsappService, WhatsappGateway, WhatsappTemplatesService],
    exports: [WhatsappService, WhatsappGateway, WhatsappTemplatesService]
})
export class WhatsappModule { }
