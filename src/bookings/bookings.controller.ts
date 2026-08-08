import {
  Body,
  Controller,
  Delete,
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
  ReversePaymentDto,
  UpdateCostSheetDto
} from './bookings.dto';
import { BookingsService } from './bookings.service';
import { CollectionsService, type AgingBucket } from './collections.service';

@ApiTags('Bookings')
@Controller('tenants/:tenantId/bookings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly collectionsService: CollectionsService,
    private readonly requestContext: RequestContextService
  ) {}

  @Permissions(...perms('bookings', ACTIONS.READ))
  @Get()
  @ApiOperation({ summary: 'List bookings with pagination and filters' })
  async list(@Param('tenantId') tenantId: string, @Query() query: BookingListQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingsService.listBookings(tenantId, query);
  }

  // NOTE: every literal single-segment route MUST be declared above
  // `@Get(':bookingId')` — Nest matches in declaration order, so the wildcard
  // would otherwise capture them (this route was previously unreachable, with
  // bookingId bound to the string "payments").
  @Permissions(...perms('bookings', ACTIONS.READ))
  @Get('payments')
  @ApiOperation({ summary: 'List all booking payments' })
  async listPayments(@Param('tenantId') tenantId: string, @Query() query: BookingPaymentQueryDto) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingsService.listPayments(tenantId, query);
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

  // ── Collections ────────────────────────────────────────────────────────────

  @Permissions(...perms('bookings', ACTIONS.READ))
  @Get('collections/summary')
  @ApiOperation({ summary: 'Collections headline: booked, received, outstanding and aging buckets' })
  async collectionsSummary(@Param('tenantId') tenantId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.collectionsService.getCollectionsSummary(tenantId);
  }

  @Permissions(...perms('bookings', ACTIONS.READ))
  @Get('collections/outstanding')
  @ApiOperation({
    summary: 'Who owes money and how late they are',
    description: 'Sorted worst-first by days overdue. Filter by aging bucket or overdue-only.'
  })
  async outstanding(
    @Param('tenantId') tenantId: string,
    @Query('bucket') bucket?: AgingBucket,
    @Query('onlyOverdue') onlyOverdue?: string
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.collectionsService.listOutstanding(tenantId, {
      bucket,
      onlyOverdue: onlyOverdue === 'true'
    });
  }

  @Permissions(...perms('bookings', ACTIONS.READ))
  @Get(':bookingId/ledger')
  @ApiOperation({
    summary: 'Full money picture for a booking',
    description: 'Payment schedule with per-instalment balances, the payment ledger, and totals.'
  })
  async ledger(@Param('tenantId') tenantId: string, @Param('bookingId') bookingId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.collectionsService.getBookingLedger(tenantId, bookingId);
  }

  @Permissions(...perms('bookings', ACTIONS.READ))
  @Get(':bookingId/cost-sheet')
  @ApiOperation({ summary: 'Itemised cost sheet with computed agreement value, GST and grand total' })
  async costSheet(@Param('tenantId') tenantId: string, @Param('bookingId') bookingId: string) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingsService.getCostSheet(tenantId, bookingId);
  }

  @Permissions(...perms('bookings', ACTIONS.UPDATE))
  @Put(':bookingId/cost-sheet')
  @ApiOperation({
    summary: 'Replace a booking cost sheet',
    description:
      'Rewrites every line, re-derives the booking amount from the new grand total, logs any discount change and recomputes the deal rollup. Rejected if the new total falls below money already received.'
  })
  async updateCostSheet(
    @Param('tenantId') tenantId: string,
    @Param('bookingId') bookingId: string,
    @Body() dto: UpdateCostSheetDto
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingsService.updateCostSheet(tenantId, bookingId, dto.items, {
      discountReason: dto.discountReason,
      actorUserId: this.requestContext.getUserId()
    });
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
  @Put(':bookingId/payments/:paymentId/allocate')
  @ApiOperation({
    summary: 'Attach a payment to an instalment (or detach it)',
    description:
      'Send milestoneId: null to leave the payment unallocated. Instalment statuses are recomputed automatically.'
  })
  async allocatePayment(
    @Param('tenantId') tenantId: string,
    @Param('bookingId') bookingId: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: { milestoneId?: string | null }
  ) {
    this.requestContext.verifyTenantAccess(tenantId);
    return this.bookingsService.allocatePayment(
      tenantId,
      bookingId,
      paymentId,
      dto.milestoneId ?? null
    );
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
