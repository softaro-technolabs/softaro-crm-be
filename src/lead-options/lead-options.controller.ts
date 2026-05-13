import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { LeadOptionsService } from './lead-options.service';
import { CreateLeadOptionDto, ListLeadOptionsDto, UpdateLeadOptionDto } from './lead-options.dto';

@ApiTags('Lead Options')
@Controller('tenants/:tenantId/lead-options')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LeadOptionsController {
  constructor(
    private readonly leadOptionsService: LeadOptionsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List lead options, optionally filtered by type' })
  async list(
    @Param('tenantId') tenantId: string,
    @Query() query: ListLeadOptionsDto,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.leadOptionsService.list(tenantId, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new lead option' })
  async create(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateLeadOptionDto,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.leadOptionsService.create(tenantId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a lead option' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLeadOptionDto,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.leadOptionsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a lead option' })
  async delete(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    await this.leadOptionsService.delete(tenantId, id);
    return null;
  }

  @Post('seed')
  @ApiOperation({ summary: 'Seed default options for this tenant (idempotent)' })
  async seed(@Param('tenantId') tenantId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.leadOptionsService.seedDefaults(tenantId);
  }
}
