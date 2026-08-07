import { LeadsModule } from '../leads/leads.module';
import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { CommonModule } from '../common/common.module';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';

@Module({
  imports: [DatabaseModule, CommonModule, LeadsModule],
  controllers: [DealsController],
  providers: [DealsService],
  exports: [DealsService]
})
export class DealsModule {}
