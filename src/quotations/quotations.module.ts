import { Module } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [QuotationsController],
  providers: [QuotationsService, PdfGeneratorService],
  exports: [QuotationsService, PdfGeneratorService]
})
export class QuotationsModule {}
