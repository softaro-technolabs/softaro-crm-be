import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions, perms, ACTIONS } from '../rbac/permissions.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequestContextService } from '../common/utils/request-context.service';
import {
  BookingListQueryDto,
  CreateBookingDto,
  UpdateBookingDto,
  CreateBookingPaymentDto,
  BookingPaymentQueryDto,
  ReversePaymentDto
} from './bookings.dto';
import { BookingsService } from './bookings.service';

@ApiTags('Bookings')
@Controller('tenants/:tenantId/bookings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly requestContext: RequestContextService
  ) {}

  @Permissions(...perms('bookings', ACTIONS.READ))
  @Get()
  @ApiOperation({ summary: 'List bookings with pagination and filters' })
  async list(@Param('tenantId') tenantId: string, @Query() query: BookingListQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingsService.listBookings(tenantId, query);
  }

  @Permissions(...perms('bookings', ACTIONS.READ))
  @Get(':bookingId')
  @ApiOperation({ summary: 'Get booking details' })
  async detail(@Param('tenantId') tenantId: string, @Param('bookingId') bookingId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingsService.getBooking(tenantId, bookingId);
  }

  @Permissions(...perms('bookings', ACTIONS.WRITE))
  @Post()
  @ApiOperation({ summary: 'Create a booking for a deal/property unit' })
  async create(@Param('tenantId') tenantId: string, @Body() dto: CreateBookingDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingsService.createBooking(tenantId, dto, this.requestContext.getUserId());
  }

  @Permissions(...perms('bookings', ACTIONS.UPDATE))
  @Put(':bookingId')
  @ApiOperation({ summary: 'Update booking status and payment progress' })
  async update(
    @Param('tenantId') tenantId: string,
    @Param('bookingId') bookingId: string,
    @Body() dto: UpdateBookingDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingsService.updateBooking(tenantId, bookingId, dto, this.requestContext.getUserId());
  }

  @Permissions(...perms('bookings', ACTIONS.DELETE))
  @Delete(':bookingId')
  @ApiOperation({
    summary: 'Cancel booking and release inventory linkage',
    description:
      'Cancels rather than deletes: payments and milestones are financial records and are retained. The unit is released for a new buyer.'
  })
  async cancel(
    @Param('tenantId') tenantId: string,
    @Param('bookingId') bookingId: string,
    @Query('reason') reason?: string
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingsService.cancelBooking(tenantId, bookingId, reason, this.requestContext.getUserId());
  }

  @Permissions(...perms('bookings', ACTIONS.READ))
  @Get(':bookingId/milestones')
  @ApiOperation({ summary: 'List payment milestones for a booking' })
  async listMilestones(@Param('tenantId') tenantId: string, @Param('bookingId') bookingId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingsService.getMilestones(tenantId, bookingId);
  }

  @Permissions(...perms('bookings', ACTIONS.WRITE))
  @Post(':bookingId/payments')
  @ApiOperation({ summary: 'Record a payment for a booking' })
  async addPayment(
    @Param('tenantId') tenantId: string,
    @Param('bookingId') bookingId: string,
    @Body() dto: CreateBookingPaymentDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingsService.addPayment(tenantId, bookingId, dto);
  }

  @Permissions(...perms('bookings', ACTIONS.UPDATE))
  @Post(':bookingId/payments/:paymentId/reverse')
  @ApiOperation({
    summary: 'Reverse a payment (bounced cheque, failed transfer, refund)',
    description:
      'Flags the payment as reversed and recomputes booking and deal totals. The original ledger row is retained.'
  })
  async reversePayment(
    @Param('tenantId') tenantId: string,
    @Param('bookingId') bookingId: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: ReversePaymentDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingsService.reversePayment(
      tenantId,
      bookingId,
      paymentId,
      dto.reason,
      this.requestContext.getUserId()
    );
  }

  @Permissions(...perms('bookings', ACTIONS.READ))
  @Get('payments')
  @ApiOperation({ summary: 'List all booking payments' })
  async listPayments(@Param('tenantId') tenantId: string, @Query() query: BookingPaymentQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingsService.listPayments(tenantId, query);
  }

  @Permissions(...perms('bookings', ACTIONS.READ))
  @Get(':bookingId/demand-letter')
  @ApiOperation({ summary: 'Generate demand letter PDF for a booking' })
  async generateDemandLetter(
    @Param('tenantId') tenantId: string,
    @Param('bookingId') bookingId: string,
    @Query('milestoneId') milestoneId: string | undefined,
    @Res() res: Response
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    const { buffer, filename } = await this.bookingsService.generateDemandLetter(tenantId, bookingId, milestoneId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Permissions(...perms('bookings', ACTIONS.READ))
  @Get(':bookingId/allotment-letter')
  @ApiOperation({ summary: 'Generate allotment letter PDF for a booking' })
  async generateAllotmentLetter(
    @Param('tenantId') tenantId: string,
    @Param('bookingId') bookingId: string,
    @Res() res: Response
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    const { buffer, filename } = await this.bookingsService.generateAllotmentLetter(tenantId, bookingId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
