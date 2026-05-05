import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [DatabaseModule, CommonModule, AutomationModule],
  controllers: [BookingsController],
  providers: [BookingsService]
})
export class BookingsModule {}
