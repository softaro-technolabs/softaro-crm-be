import { Module } from '@nestjs/common';
import { SiteVisitsController } from './site-visits.controller';
import { SiteVisitsService } from './site-visits.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AutomationModule } from '../automation/automation.module';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [NotificationsModule, AutomationModule, AttendanceModule],
  controllers: [SiteVisitsController],
  providers: [SiteVisitsService],
  exports: [SiteVisitsService]
})
export class SiteVisitsModule {}
