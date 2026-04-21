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
import { RequestContextService } from '../common/utils/request-context.service';
import { SiteVisitsService } from './site-visits.service';
import { CreateSiteVisitDto, UpdateSiteVisitDto } from './site-visits.dto';

@ApiTags('Site Visits')
@Controller('tenants/:tenantId/site-visits')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SiteVisitsController {
  constructor(
    private readonly siteVisitsService: SiteVisitsService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List site visits (optionally filtered by lead)' })
  async list(@Param('tenantId') tenantId: string, @Query('leadId') leadId?: string) {
    this.verifyTenantAccess(tenantId);
    return this.siteVisitsService.list(tenantId, leadId);
  }

  @Post()
  @ApiOperation({ summary: 'Schedule a new site visit' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreateSiteVisitDto) {
    this.verifyTenantAccess(tenantId);
    return this.siteVisitsService.create(tenantId, dto);
  }

  @Patch(':visitId')
  @ApiOperation({ summary: 'Update site visit status, feedback or rating' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('visitId') visitId: string,
    @Body() dto: UpdateSiteVisitDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.siteVisitsService.update(tenantId, visitId, dto);
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
