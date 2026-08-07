import { LeadsModule } from '../leads/leads.module';
import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { AutomationModule } from '../automation/automation.module';
import { DealsModule } from '../deals/deals.module';
import { CostSheetService } from './cost-sheet.service';
import { CollectionsService } from './collections.service';
import { BookingCommissionsService } from './booking-commissions.service';
import { PaymentPlansService } from './payment-plans.service';
import { PaymentPlansController } from './payment-plans.controller';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';

@Module({
  imports: [DatabaseModule, CommonModule, AutomationModule, LeadsModule, DealsModule],
  controllers: [BookingsController, PaymentPlansController, AccountsController],
  providers: [BookingsService, CostSheetService, CollectionsService, BookingCommissionsService, PaymentPlansService, AccountsService],
  exports: [BookingsService, CostSheetService, CollectionsService, AccountsService]
})
export class BookingsModule {}
