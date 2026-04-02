import { Module } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [QuotationsController],
  providers: [QuotationsService, PdfGeneratorService],
  exports: [QuotationsService, PdfGeneratorService]
})
export class QuotationsModule {}
