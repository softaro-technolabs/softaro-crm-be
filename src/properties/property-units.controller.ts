import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import {
  CreatePropertyUnitDto,
  PropertyUnitListQueryDto,
  UpdatePropertyUnitDto,
  UpdatePropertyUnitStatusDto
} from './properties.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Properties - Units')
@Controller('tenants/:tenantId/properties/units')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PropertyUnitsController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List property units (sellable inventory)' })
  async list(@Param('tenantId') tenantId: string, @Query() query: PropertyUnitListQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.listUnits(tenantId, query);
  }

  @Get(':unitId')
  @ApiOperation({ summary: 'Get property unit details' })
  async detail(@Param('tenantId') tenantId: string, @Param('unitId') unitId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.getUnit(tenantId, unitId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a property unit' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreatePropertyUnitDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.createUnit(tenantId, dto);
  }

  @Put(':unitId')
  @ApiOperation({ summary: 'Update a property unit' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('unitId') unitId: string,
    @Body() dto: UpdatePropertyUnitDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.updateUnit(tenantId, unitId, dto);
  }

  @Patch(':unitId/status')
  @ApiOperation({ summary: 'Change unit status (creates property_status_logs entry)' })
  async changeStatus(
    @Param('tenantId') tenantId: string,
    @Param('unitId') unitId: string,
    @Body() dto: UpdatePropertyUnitStatusDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    const changedBy = this.requestContext.getUserId();
    return this.propertiesService.changeUnitStatus(tenantId, unitId, dto, { changedByUserId: changedBy });
  }

  @Get(':unitId/status-logs')
  @ApiOperation({ summary: 'List unit status logs' })
  async statusLogs(@Param('tenantId') tenantId: string, @Param('unitId') unitId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.listUnitStatusLogs(tenantId, unitId);
  }

  @Delete(':unitId')
  @ApiOperation({ summary: 'Delete a unit (also deletes dependent data: interests, pricing, values, media, logs)' })
  async delete(@Param('tenantId') tenantId: string, @Param('unitId') unitId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    await this.propertiesService.deleteUnit(tenantId, unitId);
    return null;
  }

}

