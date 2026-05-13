import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { PropertyEntityTypesService } from './property-entity-types.service';
import { CreatePropertyEntityTypeDto, UpdatePropertyEntityTypeDto } from './property-entity-types.dto';

@ApiTags('Property Entity Types')
@Controller('tenants/:tenantId/property-entity-types')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PropertyEntityTypesController {
  constructor(
    private readonly service: PropertyEntityTypesService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all property entity types for this tenant' })
  async list(
    @Param('tenantId') tenantId: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.service.list(tenantId, activeOnly !== 'false');
  }

  @Post()
  @ApiOperation({ summary: 'Create a new property entity type' })
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreatePropertyEntityTypeDto,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.service.create(tenantId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a property entity type' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePropertyEntityTypeDto,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.service.update(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a property entity type' })
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    await this.service.delete(tenantId, id);
    return null;
  }

  @Post('seed')
  @ApiOperation({ summary: 'Seed default Indian RE entity types (idempotent)' })
  async seed(@Param('tenantId') tenantId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.service.seedDefaults(tenantId);
  }
}
