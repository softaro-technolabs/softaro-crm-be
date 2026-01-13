import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { CreateLeadActivityDto, LeadActivityListQueryDto } from './lead-activities.dto';
import { LeadActivitiesService } from './lead-activities.service';

@ApiTags('Lead Activities')
@Controller('tenants/:tenantId/leads/:leadId/activities')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LeadActivitiesController {
  constructor(
    private readonly leadActivitiesService: LeadActivitiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List lead activities (timeline)' })
  async list(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
    @Query() query: LeadActivityListQueryDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.leadActivitiesService.listLeadActivities(tenantId, leadId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a lead activity (optionally schedule next follow-up)' })
  async create(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
    @Body() dto: CreateLeadActivityDto
  ) {
    this.verifyTenantAccess(tenantId);
    const userId = this.requestContext.getUserId();
    return this.leadActivitiesService.createLeadActivity(tenantId, leadId, dto, userId ?? null);
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



