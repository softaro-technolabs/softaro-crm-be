import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions, perms, ACTIONS } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import {
  CreateLeadPropertyInterestDto,
  LeadPropertyInterestListQueryDto,
  UpdateLeadPropertyInterestDto
} from './properties.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Properties - Lead Interests')
@Controller('tenants/:tenantId/properties/interests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class LeadPropertyInterestsController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Permissions(...perms('properties', ACTIONS.READ))
  @Get()
  @ApiOperation({ summary: 'List lead-property interests' })
  async list(@Param('tenantId') tenantId: string, @Query() query: LeadPropertyInterestListQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.listLeadPropertyInterests(tenantId, query);
  }

  @Permissions(...perms('properties', ACTIONS.READ))
  @Get(':interestId')
  @ApiOperation({ summary: 'Get lead-property interest' })
  async detail(@Param('tenantId') tenantId: string, @Param('interestId') interestId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.getLeadPropertyInterest(tenantId, interestId);
  }

  @Permissions(...perms('properties', ACTIONS.WRITE))
  @Post()
  @ApiOperation({ summary: 'Create lead-property interest' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreateLeadPropertyInterestDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.createLeadPropertyInterest(tenantId, dto);
  }

  @Permissions(...perms('properties', ACTIONS.UPDATE))
  @Put(':interestId')
  @ApiOperation({ summary: 'Update lead-property interest' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('interestId') interestId: string,
    @Body() dto: UpdateLeadPropertyInterestDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.updateLeadPropertyInterest(tenantId, interestId, dto);
  }

  @Permissions(...perms('properties', ACTIONS.DELETE))
  @Delete(':interestId')
  @ApiOperation({ summary: 'Delete lead-property interest' })
  async delete(@Param('tenantId') tenantId: string, @Param('interestId') interestId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    await this.propertiesService.deleteLeadPropertyInterest(tenantId, interestId);
    return null;
  }

}

