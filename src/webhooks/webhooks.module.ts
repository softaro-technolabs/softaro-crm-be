import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [LeadsModule],          // gives us LeadsService
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
