import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import {
  CreatePropertyAttributeDto,
  PropertyAttributeListQueryDto,
  UpdatePropertyAttributeDto
} from './properties.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Properties - Attributes')
@Controller('tenants/:tenantId/properties/attributes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PropertyAttributesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List property attributes (metadata definitions)' })
  async list(@Param('tenantId') tenantId: string, @Query() query: PropertyAttributeListQueryDto) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.listAttributes(tenantId, query);
  }

  @Get(':attributeId')
  @ApiOperation({ summary: 'Get property attribute' })
  async detail(@Param('tenantId') tenantId: string, @Param('attributeId') attributeId: string) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.getAttribute(tenantId, attributeId);
  }

  @Post()
  @ApiOperation({ summary: 'Create property attribute' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreatePropertyAttributeDto) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.createAttribute(tenantId, dto);
  }

  @Put(':attributeId')
  @ApiOperation({ summary: 'Update property attribute' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('attributeId') attributeId: string,
    @Body() dto: UpdatePropertyAttributeDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.updateAttribute(tenantId, attributeId, dto);
  }

  @Delete(':attributeId')
  @ApiOperation({ summary: 'Delete property attribute (only if no values exist)' })
  async delete(@Param('tenantId') tenantId: string, @Param('attributeId') attributeId: string) {
    this.verifyTenantAccess(tenantId);
    await this.propertiesService.deleteAttribute(tenantId, attributeId);
    return null;
  }

  private verifyTenantAccess(tenantId: string) {
    const user = this.requestContext.getUser();
    if (!user) throw new ForbiddenException('User context not found');
    if (user.role_global === 'super_admin') return;
    if (user.tenant_id !== tenantId) throw new ForbiddenException('Access denied to this tenant');
  }
}

