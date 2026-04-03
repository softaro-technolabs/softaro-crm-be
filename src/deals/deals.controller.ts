import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import {
  ConvertLeadToDealDto,
  CreateDealDto,
  DealListQueryDto,
  UpdateDealDto
} from './deals.dto';
import { DealsService } from './deals.service';

@ApiTags('Deals')
@Controller('tenants/:tenantId/deals')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DealsController {
  constructor(
    private readonly dealsService: DealsService,
    private readonly requestContext: RequestContextService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List deals with pagination and filters' })
  async list(@Param('tenantId') tenantId: string, @Query() query: DealListQueryDto) {
    this.verifyTenantAccess(tenantId);
    return this.dealsService.listDeals(tenantId, query);
  }

  @Get(':dealId')
  @ApiOperation({ summary: 'Get deal details' })
  async detail(@Param('tenantId') tenantId: string, @Param('dealId') dealId: string) {
    this.verifyTenantAccess(tenantId);
    return this.dealsService.getDeal(tenantId, dealId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a deal from a lead/opportunity' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreateDealDto) {
    this.verifyTenantAccess(tenantId);
    return this.dealsService.createDeal(tenantId, dto, this.requestContext.getUserId());
  }

  @Post('convert/:leadId')
  @ApiOperation({ summary: 'Convert a lead into a deal' })
  async convertLead(
    @Param('tenantId') tenantId: string,
    @Param('leadId') leadId: string,
    @Body() dto: ConvertLeadToDealDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.dealsService.convertLeadToDeal(tenantId, leadId, dto, this.requestContext.getUserId());
  }

  @Patch(':dealId')
  @ApiOperation({ summary: 'Update deal status, amount, assignee, and closing details' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('dealId') dealId: string,
    @Body() dto: UpdateDealDto
  ) {
    this.verifyTenantAccess(tenantId);
    return this.dealsService.updateDeal(tenantId, dealId, dto, this.requestContext.getUserId());
  }

  private verifyTenantAccess(tenantId: string) {
    const user = this.requestContext.getUser();
    if (!user) {
      throw new ForbiddenException('User context not found');
    }
    if (user.role_global === 'super_admin') {
      return;
    }
    if (user.tenant_id !== tenantId) {
      throw new ForbiddenException('Access denied to this tenant');
    }
  }
}
