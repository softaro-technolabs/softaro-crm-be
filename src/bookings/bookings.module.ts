import { LeadsModule } from '../leads/leads.module';
import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { AutomationModule } from '../automation/automation.module';
import { DealsModule } from '../deals/deals.module';

@Module({
  imports: [DatabaseModule, CommonModule, AutomationModule, LeadsModule, DealsModule],
  controllers: [BookingsController],
  providers: [BookingsService]
})
export class BookingsModule {}
