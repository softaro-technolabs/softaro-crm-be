import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ACTIONS, Permissions, perms } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import { CreatePaymentPlanDto, UpdatePaymentPlanDto } from './payment-plans.dto';
import { PaymentPlansService } from './payment-plans.service';

@ApiTags('Payment Plans')
@Controller('tenants/:tenantId/payment-plans')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class PaymentPlansController {
  constructor(
    private readonly paymentPlansService: PaymentPlansService,
    private readonly requestContext: RequestContextService
  ) {}

  @Permissions(...perms('bookings', ACTIONS.READ))
  @Get()
  @ApiOperation({
    summary: 'List payment plan templates',
    description: 'Pass entityId to get a project’s plans plus any tenant-wide defaults.'
  })
  async list(@Param('tenantId') tenantId: string, @Query('entityId') entityId?: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.paymentPlansService.list(tenantId, entityId);
  }

  @Permissions(...perms('bookings', ACTIONS.READ))
  @Get(':templateId')
  @ApiOperation({ summary: 'Get a payment plan template with its instalments' })
  async get(@Param('tenantId') tenantId: string, @Param('templateId') templateId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.paymentPlansService.get(tenantId, templateId);
  }

  @Permissions(...perms('bookings', ACTIONS.WRITE))
  @Post()
  @ApiOperation({
    summary: 'Create a payment plan template',
    description: 'Percentage instalments must total 100%.'
  })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreatePaymentPlanDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.paymentPlansService.create(tenantId, dto);
  }

  @Permissions(...perms('bookings', ACTIONS.UPDATE))
  @Put(':templateId')
  @ApiOperation({ summary: 'Update a payment plan template' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('templateId') templateId: string,
    @Body() dto: UpdatePaymentPlanDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.paymentPlansService.update(tenantId, templateId, dto);
  }

  @Permissions(...perms('bookings', ACTIONS.DELETE))
  @Delete(':templateId')
  @ApiOperation({
    summary: 'Delete a payment plan template',
    description: 'Bookings already created keep their schedule — milestones are copies, not references.'
  })
  async remove(@Param('tenantId') tenantId: string, @Param('templateId') templateId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.paymentPlansService.remove(tenantId, templateId);
  }
}
