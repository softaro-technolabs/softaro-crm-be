import { Body, Controller, ForbiddenException, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import { ReplacePricingBreakupsDto } from './properties.dto';
import { GenerateCostSheetDto } from './properties.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Properties - Pricing')
@Controller('tenants/:tenantId/properties')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PropertyPricingController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get('units/:unitId/pricing-breakups')
  @ApiOperation({ summary: 'Get unit pricing breakups' })
  async list(@Param('tenantId') tenantId: string, @Param('unitId') unitId: string) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.getUnitPricingBreakups(tenantId, unitId);
  }

  @Put('units/:unitId/pricing-breakups')
  @ApiOperation({ summary: 'Replace unit pricing breakups (PUT = replace all)' })
  async replace(
    @Param('tenantId') tenantId: string,
    @Param('unitId') unitId: string,
    @Body() dto: ReplacePricingBreakupsDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.replaceUnitPricingBreakups(tenantId, unitId, dto);
  }

  @Post('cost-sheets/generate')
  @ApiOperation({ summary: 'Generate unit cost sheet' })
  async generateCostSheet(
    @Param('tenantId') tenantId: string,
    @Body() dto: GenerateCostSheetDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.propertiesService.generateCostSheet(tenantId, dto);
  }

  private verifyTenantAccess(tenantId: string) {
    const user = this.requestContext.getUser();
    if (!user) throw new ForbiddenException('User context not found');
    if (user.role_global === 'super_admin') return;
    if (user.tenant_id !== tenantId) throw new ForbiddenException('Access denied to this tenant');
  }
}

