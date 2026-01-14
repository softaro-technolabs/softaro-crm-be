import { Controller, ForbiddenException, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { LeadFollowUpsQueryDto } from './lead-activities.dto';
import { LeadActivitiesService } from './lead-activities.service';

@ApiTags('Lead Follow-ups')
@Controller('tenants/:tenantId/leads/follow-ups')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LeadFollowUpsController {
  constructor(
    private readonly leadActivitiesService: LeadActivitiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List leads with due/overdue follow-ups (based on leads.nextFollowUpAt)' })
  async list(@Param('tenantId') tenantId: string, @Query() query: LeadFollowUpsQueryDto) {
    this.verifyTenantAccess(tenantId);
    return this.leadActivitiesService.listFollowUps(tenantId, query);
  }

  private verifyTenantAccess(tenantId: string) {
    const user = this.requestContext.getUser();
    if (!user) {
      throw new ForbiddenException('User context not found');
    }

    if (user.role_global === 'super_admin') {
      return;
    }

    if (user.tenant_id !== tenantId) {
      throw new ForbiddenException('Access denied to this tenant');
    }
  }
}




