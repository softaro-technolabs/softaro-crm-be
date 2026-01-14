import { Module } from '@nestjs/common';

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
import { LeadTasksController } from './lead-tasks.controller';
import { LeadTasksService } from './lead-tasks.service';
import { TenantTasksController } from './tenant-tasks.controller';

@Module({
  imports: [DatabaseModule, CommonModule, UsersModule],
  controllers: [
    LeadsController,
    LeadAssignmentController,
    LeadPublicController,
    LeadActivitiesController,
    LeadFollowUpsController,
    LeadTasksController,
    TenantTasksController
  ],
  providers: [LeadsService, LeadAssignmentService, LeadActivitiesService, LeadTasksService],
  exports: [LeadsService, LeadAssignmentService, LeadActivitiesService, LeadTasksService]
})
export class LeadsModule {}


