import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions, perms, ACTIONS } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import { UpsertAttributeValuesDto } from './properties.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Properties - Attribute Values')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
@Controller('tenants/:tenantId/properties')
export class PropertyAttributeValuesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Permissions(...perms('properties-attributes', ACTIONS.READ))
  @Get('entities/:entityId/attributes')
  @ApiOperation({ summary: 'List entity attribute values (scope=entity)' })
  async listEntity(@Param('tenantId') tenantId: string, @Param('entityId') entityId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.listEntityAttributeValues(tenantId, entityId);
  }

  @Permissions(...perms('properties-attributes', ACTIONS.UPDATE))
  @Put('entities/:entityId/attributes')
  @ApiOperation({ summary: 'Upsert entity attribute values (null deletes)' })
  async upsertEntity(
    @Param('tenantId') tenantId: string,
    @Param('entityId') entityId: string,
    @Body() dto: UpsertAttributeValuesDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.upsertEntityAttributeValues(tenantId, entityId, dto);
  }

  @Permissions(...perms('properties-attributes', ACTIONS.READ))
  @Get('units/:unitId/attributes')
  @ApiOperation({ summary: 'List unit attribute values (scope=unit)' })
  async listUnit(@Param('tenantId') tenantId: string, @Param('unitId') unitId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.listUnitAttributeValues(tenantId, unitId);
  }

  @Permissions(...perms('properties-attributes', ACTIONS.UPDATE))
  @Put('units/:unitId/attributes')
  @ApiOperation({ summary: 'Upsert unit attribute values (null deletes)' })
  async upsertUnit(
    @Param('tenantId') tenantId: string,
    @Param('unitId') unitId: string,
    @Body() dto: UpsertAttributeValuesDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.upsertUnitAttributeValues(tenantId, unitId, dto);
  }

}

