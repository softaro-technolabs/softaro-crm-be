import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import {
  CreateLeadPropertyInterestDto,
  LeadPropertyInterestListQueryDto,
  UpdateLeadPropertyInterestDto
} from './properties.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Properties - Lead Interests')
@Controller('tenants/:tenantId/properties/interests')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LeadPropertyInterestsController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List lead-property interests' })
  async list(@Param('tenantId') tenantId: string, @Query() query: LeadPropertyInterestListQueryDto) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.listLeadPropertyInterests(tenantId, query);
  }

  @Get(':interestId')
  @ApiOperation({ summary: 'Get lead-property interest' })
  async detail(@Param('tenantId') tenantId: string, @Param('interestId') interestId: string) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.getLeadPropertyInterest(tenantId, interestId);
  }

  @Post()
  @ApiOperation({ summary: 'Create lead-property interest' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreateLeadPropertyInterestDto) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.createLeadPropertyInterest(tenantId, dto);
  }

  @Put(':interestId')
  @ApiOperation({ summary: 'Update lead-property interest' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('interestId') interestId: string,
    @Body() dto: UpdateLeadPropertyInterestDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.updateLeadPropertyInterest(tenantId, interestId, dto);
  }

  @Delete(':interestId')
  @ApiOperation({ summary: 'Delete lead-property interest' })
  async delete(@Param('tenantId') tenantId: string, @Param('interestId') interestId: string) {
    this.verifyTenantAccess(tenantId);
    await this.propertiesService.deleteLeadPropertyInterest(tenantId, interestId);
    return null;
  }

  private verifyTenantAccess(tenantId: string) {
    const user = this.requestContext.getUser();
    if (!user) throw new ForbiddenException('User context not found');
    if (user.role_global === 'super_admin') return;
    if (user.tenant_id !== tenantId) throw new ForbiddenException('Access denied to this tenant');
  }
}

