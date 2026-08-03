import { Module } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { ChannelPartnersModule } from '../channel-partners/channel-partners.module';

@Module({
  imports: [CommonModule, DatabaseModule, ChannelPartnersModule],
  controllers: [QuotationsController],
  providers: [QuotationsService, PdfGeneratorService],
  exports: [QuotationsService, PdfGeneratorService]
})
export class QuotationsModule {}
