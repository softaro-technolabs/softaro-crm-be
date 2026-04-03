import { Module } from '@nestjs/common';
import { MetaAdsService } from './meta-ads.service';
import { MetaAdsController, MetaAdsWebhookController } from './meta-ads.controller';
import { LeadsModule } from '../leads/leads.module';
import { EncryptionService } from '../common/services/encryption.service';
import { RequestContextService } from '../common/utils/request-context.service';

@Module({
    imports: [LeadsModule],
    providers: [MetaAdsService, EncryptionService, RequestContextService],
    controllers: [MetaAdsController, MetaAdsWebhookController],
    exports: [MetaAdsService]
})
export class MetaAdsModule { }
