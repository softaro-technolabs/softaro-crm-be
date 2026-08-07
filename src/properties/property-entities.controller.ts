import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions, perms, ACTIONS } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import { CreatePropertyEntityDto, PropertyEntityListQueryDto, UpdatePropertyEntityDto } from './properties.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Properties - Entities')
@Controller('tenants/:tenantId/properties/entities')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class PropertyEntitiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Permissions(...perms('properties', ACTIONS.READ))
  @Get()
  @ApiOperation({ summary: 'List property entities (projects/buildings/plots/units/land/villas)' })
  async list(@Param('tenantId') tenantId: string, @Query() query: PropertyEntityListQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.listEntities(tenantId, query);
  }

  @Permissions(...perms('properties', ACTIONS.READ))
  @Get(':entityId')
  @ApiOperation({ summary: 'Get property entity details (includes location)' })
  async detail(@Param('tenantId') tenantId: string, @Param('entityId') entityId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.getEntity(tenantId, entityId);
  }

  @Permissions(...perms('properties', ACTIONS.WRITE))
  @Post()
  @ApiOperation({ summary: 'Create property entity' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreatePropertyEntityDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    const createdBy = this.requestContext.getUserId();
    return this.propertiesService.createEntity(tenantId, dto, { createdByUserId: createdBy });
  }

  @Permissions(...perms('properties', ACTIONS.UPDATE))
  @Put(':entityId')
  @ApiOperation({ summary: 'Update property entity' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('entityId') entityId: string,
    @Body() dto: UpdatePropertyEntityDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.updateEntity(tenantId, entityId, dto);
  }

  @Permissions(...perms('properties', ACTIONS.DELETE))
  @Delete(':entityId')
  @ApiOperation({ summary: 'Delete property entity (only if no children/units exist)' })
  async delete(@Param('tenantId') tenantId: string, @Param('entityId') entityId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    await this.propertiesService.deleteEntity(tenantId, entityId);
    return null;
  }

}

