import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ForbiddenException
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions, perms, ACTIONS } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { SiteVisitsService } from './site-visits.service';
import { CreateSiteVisitDto, SiteVisitCheckInDto, UpdateSiteVisitDto } from './site-visits.dto';

@ApiTags('Site Visits')
@Controller('tenants/:tenantId/site-visits')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class SiteVisitsController {
  constructor(
    private readonly siteVisitsService: SiteVisitsService,
    private readonly requestContext: RequestContextService
  ) {}

  @Permissions(...perms('leads', ACTIONS.READ))
  @Get()
  @ApiOperation({ summary: 'List site visits (optionally filtered by lead)' })
  async list(@Param('tenantId') tenantId: string, @Query('leadId') leadId?: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.siteVisitsService.list(tenantId, leadId);
  }

  @Permissions(...perms('leads', ACTIONS.WRITE))
  @Post()
  @ApiOperation({ summary: 'Schedule a new site visit' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreateSiteVisitDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.siteVisitsService.create(tenantId, dto);
  }

  @Permissions(...perms('leads', ACTIONS.WRITE))
  @Post(':visitId/check-in')
  @ApiOperation({ summary: 'Agent GPS check-in at the property (marks attendance when enabled)' })
  async checkIn(
    @Param('tenantId') tenantId: string,
    @Param('visitId') visitId: string,
    @Body() dto: SiteVisitCheckInDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.siteVisitsService.checkIn(tenantId, visitId, dto);
  }

  @Permissions(...perms('leads', ACTIONS.UPDATE))
  @Patch(':visitId')
  @ApiOperation({ summary: 'Update site visit status, feedback or rating' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('visitId') visitId: string,
    @Body() dto: UpdateSiteVisitDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.siteVisitsService.update(tenantId, visitId, dto);
  }
}
