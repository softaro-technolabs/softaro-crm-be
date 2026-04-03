import { Module } from '@nestjs/common';
import { MetaAdsService } from './meta-ads.service';
import { MetaAdsController, MetaAdsWebhookController } from './meta-ads.controller';
import { LeadsModule } from '../leads/leads.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
    imports: [LeadsModule, WhatsappModule],
    providers: [MetaAdsService],
    controllers: [MetaAdsController, MetaAdsWebhookController],
    exports: [MetaAdsService]
})
export class MetaAdsModule { }
