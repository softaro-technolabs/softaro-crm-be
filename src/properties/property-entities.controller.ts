import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import { CreatePropertyEntityDto, PropertyEntityListQueryDto, UpdatePropertyEntityDto } from './properties.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Properties - Entities')
@Controller('tenants/:tenantId/properties/entities')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PropertyEntitiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List property entities (projects/buildings/plots/units/land/villas)' })
  async list(@Param('tenantId') tenantId: string, @Query() query: PropertyEntityListQueryDto) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.listEntities(tenantId, query);
  }

  @Get(':entityId')
  @ApiOperation({ summary: 'Get property entity details (includes location)' })
  async detail(@Param('tenantId') tenantId: string, @Param('entityId') entityId: string) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.getEntity(tenantId, entityId);
  }

  @Post()
  @ApiOperation({ summary: 'Create property entity' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreatePropertyEntityDto) {
    this.verifyTenantAccess(tenantId);
    const createdBy = this.requestContext.getUserId();
    return this.propertiesService.createEntity(tenantId, dto, { createdByUserId: createdBy });
  }

  @Put(':entityId')
  @ApiOperation({ summary: 'Update property entity' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('entityId') entityId: string,
    @Body() dto: UpdatePropertyEntityDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.updateEntity(tenantId, entityId, dto);
  }

  @Delete(':entityId')
  @ApiOperation({ summary: 'Delete property entity (only if no children/units exist)' })
  async delete(@Param('tenantId') tenantId: string, @Param('entityId') entityId: string) {
    this.verifyTenantAccess(tenantId);
    await this.propertiesService.deleteEntity(tenantId, entityId);
    return null;
  }

  private verifyTenantAccess(tenantId: string) {
    const user = this.requestContext.getUser();
    if (!user) {
      throw new ForbiddenException('User context not found');
    }
    if (user.role_global === 'super_admin') return;
    if (user.tenant_id !== tenantId) throw new ForbiddenException('Access denied to this tenant');
  }
}

