import { Module } from '@nestjs/common';
import { GoogleAdsService } from './google-ads.service';
import { GoogleAdsController, GoogleAdsWebhookController } from './google-ads.controller';
import { LeadsModule } from '../leads/leads.module';

@Module({
    imports: [LeadsModule],
    providers: [GoogleAdsService],
    controllers: [GoogleAdsController, GoogleAdsWebhookController],
    exports: [GoogleAdsService]
})
export class GoogleAdsModule { }
