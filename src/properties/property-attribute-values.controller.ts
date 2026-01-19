import { Body, Controller, ForbiddenException, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import { UpsertAttributeValuesDto } from './properties.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Properties - Attribute Values')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('tenants/:tenantId/properties')
export class PropertyAttributeValuesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get('entities/:entityId/attributes')
  @ApiOperation({ summary: 'List entity attribute values (scope=entity)' })
  async listEntity(@Param('tenantId') tenantId: string, @Param('entityId') entityId: string) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.listEntityAttributeValues(tenantId, entityId);
  }

  @Put('entities/:entityId/attributes')
  @ApiOperation({ summary: 'Upsert entity attribute values (null deletes)' })
  async upsertEntity(
    @Param('tenantId') tenantId: string,
    @Param('entityId') entityId: string,
    @Body() dto: UpsertAttributeValuesDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.upsertEntityAttributeValues(tenantId, entityId, dto);
  }

  @Get('units/:unitId/attributes')
  @ApiOperation({ summary: 'List unit attribute values (scope=unit)' })
  async listUnit(@Param('tenantId') tenantId: string, @Param('unitId') unitId: string) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.listUnitAttributeValues(tenantId, unitId);
  }

  @Put('units/:unitId/attributes')
  @ApiOperation({ summary: 'Upsert unit attribute values (null deletes)' })
  async upsertUnit(
    @Param('tenantId') tenantId: string,
    @Param('unitId') unitId: string,
    @Body() dto: UpsertAttributeValuesDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.upsertUnitAttributeValues(tenantId, unitId, dto);
  }

  private verifyTenantAccess(tenantId: string) {
    const user = this.requestContext.getUser();
    if (!user) throw new ForbiddenException('User context not found');
    if (user.role_global === 'super_admin') return;
    if (user.tenant_id !== tenantId) throw new ForbiddenException('Access denied to this tenant');
  }
}

