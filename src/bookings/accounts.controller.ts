import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ACTIONS, Permissions, perms } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { AccountsService } from './accounts.service';
import { BookingCommissionsService } from './booking-commissions.service';

@ApiTags('Accounts')
@Controller('tenants/:tenantId/accounts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly bookingCommissions: BookingCommissionsService,
    private readonly requestContext: RequestContextService
  ) {}

  @Permissions(...perms('payments', ACTIONS.READ))
  @Get('summary')
  @ApiOperation({
    summary: 'Accounting headline',
    description:
      'Collected (period and lifetime), receivable, bounced, commissions accrued vs paid, and collected money net of commission.'
  })
  async summary(
    @Param('tenantId') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.accountsService.getAccountsSummary(tenantId, { from, to });
  }

  @Permissions(...perms('payments', ACTIONS.READ))
  @Get('payments')
  @ApiOperation({
    summary: 'Receipt register — every payment across every booking',
    description: 'Filter by status, method, booking or date range.'
  })
  async payments(
    @Param('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('bookingId') bookingId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.accountsService.listPayments(tenantId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
      paymentMethod,
      bookingId,
      from,
      to
    });
  }

  @Permissions(...perms('commissions', ACTIONS.READ))
  @Get('commissions')
  @ApiOperation({
    summary: 'Channel-partner commissions payable',
    description:
      'Commission exists for channel partners only — internal staff are paid through payroll. Returns earned vs unearned based on how much of the booking has actually been collected.'
  })
  async commissions(
    @Param('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.accountsService.listCommissions(tenantId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status
    });
  }

  @Permissions(...perms('commissions', ACTIONS.READ))
  @Get('commission-settings')
  @ApiOperation({ summary: 'Tenant commission rates' })
  async getSettings(@Param('tenantId') tenantId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingCommissions.getSettings(tenantId);
  }

  @Permissions(...perms('commissions', ACTIONS.UPDATE))
  @Put('commission-settings')
  @ApiOperation({
    summary: 'Update commission rates',
    description: 'Applies to commissions accrued from here on; existing pending rows are refreshed on the next booking update.'
  })
  async updateSettings(
    @Param('tenantId') tenantId: string,
    @Body()
    dto: { defaultPartnerPercentage?: number; earnOnCollection?: boolean }
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingCommissions.updateSettings(tenantId, dto);
  }
}
