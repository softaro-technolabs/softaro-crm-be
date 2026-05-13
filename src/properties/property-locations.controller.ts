import { Body, Controller, ForbiddenException, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import { UpsertPropertyLocationDto } from './properties.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Properties - Locations')
@Controller('tenants/:tenantId/properties/entities/:entityId/location')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PropertyLocationsController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get location for an entity' })
  async get(@Param('tenantId') tenantId: string, @Param('entityId') entityId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.getEntityLocation(tenantId, entityId);
  }

  @Put()
  @ApiOperation({ summary: 'Upsert location for an entity' })
  async upsert(
    @Param('tenantId') tenantId: string,
    @Param('entityId') entityId: string,
    @Body() dto: UpsertPropertyLocationDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.propertiesService.upsertEntityLocation(tenantId, entityId, dto);
  }

}

