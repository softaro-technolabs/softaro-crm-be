import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions, perms, ACTIONS } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import { CreatePropertyMediaDto, PropertyMediaListQueryDto, UpdatePropertyMediaDto } from './properties.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Properties - Media')
@Controller('tenants/:tenantId/properties/media')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class PropertyMediaController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Permissions(...perms('properties', ACTIONS.READ))
  @Get()
  @ApiOperation({ summary: 'List media for an entity (optionally a unit)' })
  async list(@Param('tenantId') tenantId: string, @Query() query: PropertyMediaListQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.listMedia(tenantId, { entityId: query.entityId, unitId: query.unitId });
  }

  @Permissions(...perms('properties', ACTIONS.WRITE))
  @Post()
  @ApiOperation({ summary: 'Create media record' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreatePropertyMediaDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.createMedia(tenantId, dto);
  }

  @Permissions(...perms('properties', ACTIONS.UPDATE))
  @Put(':mediaId')
  @ApiOperation({ summary: 'Update media record' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('mediaId') mediaId: string,
    @Body() dto: UpdatePropertyMediaDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.updateMedia(tenantId, mediaId, dto);
  }

  @Permissions(...perms('properties', ACTIONS.DELETE))
  @Delete(':mediaId')
  @ApiOperation({ summary: 'Delete media record' })
  async delete(@Param('tenantId') tenantId: string, @Param('mediaId') mediaId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    await this.propertiesService.deleteMedia(tenantId, mediaId);
    return null;
  }

}

