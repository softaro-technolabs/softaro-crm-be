import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions, perms, ACTIONS } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import { ReplacePricingBreakupsDto } from './properties.dto';
import { GenerateCostSheetDto } from './properties.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Properties - Pricing')
@Controller('tenants/:tenantId/properties')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class PropertyPricingController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Permissions(...perms('properties', ACTIONS.READ))
  @Get('units/:unitId/pricing-breakups')
  @ApiOperation({ summary: 'Get unit pricing breakups' })
  async list(@Param('tenantId') tenantId: string, @Param('unitId') unitId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.getUnitPricingBreakups(tenantId, unitId);
  }

  @Permissions(...perms('properties', ACTIONS.UPDATE))
  @Put('units/:unitId/pricing-breakups')
  @ApiOperation({ summary: 'Replace unit pricing breakups (PUT = replace all)' })
  async replace(
    @Param('tenantId') tenantId: string,
    @Param('unitId') unitId: string,
    @Body() dto: ReplacePricingBreakupsDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.replaceUnitPricingBreakups(tenantId, unitId, dto);
  }

  @Permissions(...perms('properties', ACTIONS.WRITE))
  @Post('cost-sheets/generate')
  @ApiOperation({ summary: 'Generate unit cost sheet' })
  async generateCostSheet(
    @Param('tenantId') tenantId: string,
    @Body() dto: GenerateCostSheetDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.generateCostSheet(tenantId, dto);
  }

}

