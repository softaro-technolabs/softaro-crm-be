import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';
import { LeadActivitiesController } from './lead-activities.controller';
import { LeadActivitiesService } from './lead-activities.service';
import { LeadAssignmentController } from './lead-assignment.controller';
import { LeadAssignmentService } from './lead-assignment.service';
import { LeadPublicController } from './lead-public.controller';
import { LeadFollowUpsController } from './lead-followups.controller';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadTasksService } from './lead-tasks.service';
import { TenantTasksController } from './tenant-tasks.controller';
import { CalendarSyncModule } from '../calendar-sync/calendar-sync.module';

@Module({
  imports: [DatabaseModule, CommonModule, UsersModule, NotificationsModule, CalendarSyncModule],
  controllers: [
    LeadAssignmentController,
    LeadPublicController,
    LeadActivitiesController,
    LeadFollowUpsController,
    TenantTasksController,
    LeadsController
  ],
  providers: [LeadsService, LeadAssignmentService, LeadActivitiesService, LeadTasksService],
  exports: [LeadsService, LeadAssignmentService, LeadActivitiesService, LeadTasksService]
})
export class LeadsModule { }


