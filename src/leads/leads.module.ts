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

@Module({
  imports: [DatabaseModule, CommonModule, UsersModule],
  controllers: [
    LeadsController,
    LeadAssignmentController,
    LeadPublicController,
    LeadActivitiesController,
    LeadFollowUpsController
  ],
  providers: [LeadsService, LeadAssignmentService, LeadActivitiesService],
  exports: [LeadsService, LeadAssignmentService, LeadActivitiesService]
})
export class LeadsModule {}


