import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';
import { LeadOptionsController } from './lead-options.controller';
import { LeadOptionsService } from './lead-options.service';

@Module({
  imports: [DatabaseModule, CommonModule],
  controllers: [LeadOptionsController],
  providers: [LeadOptionsService],
  exports: [LeadOptionsService],
})
export class LeadOptionsModule {}
