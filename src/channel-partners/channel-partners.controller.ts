import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';

import {
  ChannelPartnerListQueryDto,
  CreateChannelPartnerDto,
  CreateCpUserDto,
  IncentiveListQueryDto,
  UpdateChannelPartnerDto
} from './channel-partners.dto';
import { ChannelPartnersService } from './channel-partners.service';

@ApiTags('Channel Partners')
@Controller('tenants/:tenantId/channel-partners')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChannelPartnersController {
  constructor(
    private readonly service: ChannelPartnersService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List channel partners' })
  async list(@Param('tenantId') tenantId: string, @Query() query: ChannelPartnerListQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.service.listPartners(tenantId, query);
  }

  @Get('incentives')
  @ApiOperation({ summary: 'List channel-partner incentives' })
  async listIncentives(@Param('tenantId') tenantId: string, @Query() query: IncentiveListQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.service.listIncentives(tenantId, query);
  }

  @Patch('incentives/:incentiveId/approve')
  @ApiOperation({ summary: 'Approve an accrued incentive' })
  async approveIncentive(@Param('tenantId') tenantId: string, @Param('incentiveId') incentiveId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.service.setIncentiveStatus(tenantId, incentiveId, 'approved');
  }

  @Patch('incentives/:incentiveId/pay')
  @ApiOperation({ summary: 'Mark an approved incentive as paid' })
  async payIncentive(@Param('tenantId') tenantId: string, @Param('incentiveId') incentiveId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.service.setIncentiveStatus(tenantId, incentiveId, 'paid');
  }

  @Get(':partnerId')
  @ApiOperation({ summary: 'Get a channel partner (with portal accounts)' })
  async detail(@Param('tenantId') tenantId: string, @Param('partnerId') partnerId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.service.getPartner(tenantId, partnerId);
  }

  @Get(':partnerId/leads')
  @ApiOperation({ summary: 'List leads attributed to a channel partner' })
  async attributedLeads(@Param('tenantId') tenantId: string, @Param('partnerId') partnerId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.service.listAttributedLeads(tenantId, partnerId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a channel partner' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreateChannelPartnerDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.service.createPartner(tenantId, dto, { createdByUserId: this.requestContext.getUserId() });
  }

  @Post(':partnerId/users')
  @ApiOperation({ summary: 'Create a portal login account for a channel partner' })
  async createUser(@Param('tenantId') tenantId: string, @Param('partnerId') partnerId: string, @Body() dto: CreateCpUserDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.service.createCpUser(tenantId, partnerId, dto);
  }

  @Put(':partnerId')
  @ApiOperation({ summary: 'Update a channel partner' })
  async update(@Param('tenantId') tenantId: string, @Param('partnerId') partnerId: string, @Body() dto: UpdateChannelPartnerDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.service.updatePartner(tenantId, partnerId, dto);
  }

  @Delete(':partnerId')
  @ApiOperation({ summary: 'Delete a channel partner (only if no incentives exist)' })
  async remove(@Param('tenantId') tenantId: string, @Param('partnerId') partnerId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    await this.service.deletePartner(tenantId, partnerId);
    return null;
  }
}
