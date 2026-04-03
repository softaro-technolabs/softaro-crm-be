import { Module } from '@nestjs/common';
import { MetaAdsService } from './meta-ads.service';
import { MetaAdsController, MetaAdsWebhookController } from './meta-ads.controller';
import { LeadsModule } from '../leads/leads.module';

@Module({
    imports: [LeadsModule],
    providers: [MetaAdsService],
    controllers: [MetaAdsController, MetaAdsWebhookController],
    exports: [MetaAdsService]
})
export class MetaAdsModule { }
