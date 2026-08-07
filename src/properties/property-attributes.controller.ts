import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions, perms, ACTIONS } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import {
  CreatePropertyAttributeDto,
  PropertyAttributeListQueryDto,
  UpdatePropertyAttributeDto
} from './properties.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Properties - Attributes')
@Controller('tenants/:tenantId/properties/attributes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class PropertyAttributesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Permissions(...perms('properties-attributes', ACTIONS.READ))
  @Get()
  @ApiOperation({ summary: 'List property attributes (metadata definitions)' })
  async list(@Param('tenantId') tenantId: string, @Query() query: PropertyAttributeListQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.listAttributes(tenantId, query);
  }

  @Permissions(...perms('properties-attributes', ACTIONS.READ))
  @Get(':attributeId')
  @ApiOperation({ summary: 'Get property attribute' })
  async detail(@Param('tenantId') tenantId: string, @Param('attributeId') attributeId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.getAttribute(tenantId, attributeId);
  }

  @Permissions(...perms('properties-attributes', ACTIONS.WRITE))
  @Post()
  @ApiOperation({ summary: 'Create property attribute' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreatePropertyAttributeDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.createAttribute(tenantId, dto);
  }

  @Permissions(...perms('properties-attributes', ACTIONS.UPDATE))
  @Put(':attributeId')
  @ApiOperation({ summary: 'Update property attribute' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('attributeId') attributeId: string,
    @Body() dto: UpdatePropertyAttributeDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.updateAttribute(tenantId, attributeId, dto);
  }

  @Permissions(...perms('properties-attributes', ACTIONS.DELETE))
  @Delete(':attributeId')
  @ApiOperation({ summary: 'Delete property attribute (only if no values exist)' })
  async delete(@Param('tenantId') tenantId: string, @Param('attributeId') attributeId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    await this.propertiesService.deleteAttribute(tenantId, attributeId);
    return null;
  }

}

