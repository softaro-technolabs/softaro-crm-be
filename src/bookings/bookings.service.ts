import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase, DrizzleExecutor, DrizzleTransaction } from '../database/database.types';
import {
  bookings,
  bookingMilestones,
  bookingPayments,
  deals,
  leadActivities,
  leads,
  propertyEntities,
  propertyStatusLogs,
  propertyUnits,
  propertyDocuments,
  tenants,
  users
} from '../database/schema';
import { PaginationUtil } from '../common/utils/pagination.util';
import {
  DOCUMENT_SEQUENCE,
  DocumentNumberService
} from '../common/services/document-number.service';
import {
  type BookingStatus,
  BookingListQueryDto,
  CreateBookingDto,
  UpdateBookingDto,
  CreateBookingPaymentDto,
  BookingPaymentQueryDto
} from './bookings.dto';
import { AutomationService } from '../automation/automation.service';
import { LeadPipelineService, PIPELINE_STAGE } from '../leads/lead-pipeline.service';
import { DealsService } from '../deals/deals.service';
import { generateDemandLetterPdf } from '../common/pdf-templates/demand-letter.template';
import { generateAllotmentLetterPdf } from '../common/pdf-templates/allotment-letter.template';

@Injectable()
export class BookingsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly automationService: AutomationService,
    private readonly leadPipeline: LeadPipelineService,
    private readonly documentNumbers: DocumentNumberService,
    private readonly dealsService: DealsService
  ) {}

  /** Statuses in which a booking holds its unit against all other buyers. */
  private static readonly LIVE_STATUSES: BookingStatus[] = ['confirmed', 'completed'];

  /**
   * Rejects a second live booking on a unit that is already sold.
   *
   * `bookings_live_unit_uq` enforces this in the database regardless; this check
   * exists so the caller gets a readable message instead of a constraint error.
   */
  private async assertUnitIsFree(
    tenantId: string,
    propertyUnitId: string,
    status: BookingStatus,
    excludeBookingId?: string
  ) {
    if (!BookingsService.LIVE_STATUSES.includes(status)) return;

    const conflicts = await this.db
      .select({ id: bookings.id, bookingNumber: bookings.bookingNumber })
      .from(bookings)
      .where(
        and(
          eq(bookings.tenantId, tenantId),
          eq(bookings.propertyUnitId, propertyUnitId),
          inArray(bookings.status, BookingsService.LIVE_STATUSES)
        )
      );

    const blocking = conflicts.find((row) => row.id !== excludeBookingId);
    if (blocking) {
      throw new ConflictException(
        `This unit is already booked under ${blocking.bookingNumber}. Cancel that booking before creating another.`
      );
    }
  }

  async listBookings(tenantId: string, query: BookingListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const baseFilters = [eq(bookings.tenantId, tenantId)];
    if (query.status) baseFilters.push(eq(bookings.status, query.status));
    if (query.dealId) baseFilters.push(eq(bookings.dealId, query.dealId));

    const searchFilter = query.search
      ? or(
          sql`${bookings.bookingNumber} ILIKE ${`%${query.search}%`}`,
          sql`${deals.dealNumber} ILIKE ${`%${query.search}%`}`,
          sql`${leads.name} ILIKE ${`%${query.search}%`}`,
          sql`${propertyUnits.unitCode} ILIKE ${`%${query.search}%`}`
        )
      : null;

    const filters = [...baseFilters];
    if (searchFilter) filters.push(searchFilter);
    const whereClause = PaginationUtil.buildFilters(filters);

    const allowedSortFields = {
      bookingNumber: bookings.bookingNumber,
      bookingDate: bookings.bookingDate,
      createdAt: bookings.createdAt,
      updatedAt: bookings.updatedAt,
      bookingAmount: bookings.bookingAmount,
      paidAmount: bookings.paidAmount
    };

    const orderBy = PaginationUtil.buildOrderBy(
      bookings.bookingDate,
      query.sortBy,
      query.sortOrder || 'desc',
      allowedSortFields
    );

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          booking: bookings,
          deal: {
            id: deals.id,
            dealNumber: deals.dealNumber,
            status: deals.status
          },
          lead: {
            id: leads.id,
            name: leads.name,
            email: leads.email,
            phone: leads.phone
          },
          propertyUnit: {
            id: propertyUnits.id,
            unitCode: propertyUnits.unitCode,
            unitStatus: propertyUnits.unitStatus,
            price: propertyUnits.price
          },
          propertyEntity: {
            id: propertyEntities.id,
            name: propertyEntities.name,
            entityType: propertyEntities.entityType
          }
        })
        .from(bookings)
        .leftJoin(deals, eq(bookings.dealId, deals.id))
        .leftJoin(leads, eq(bookings.leadId, leads.id))
        .leftJoin(propertyUnits, eq(bookings.propertyUnitId, propertyUnits.id))
        .leftJoin(propertyEntities, eq(propertyUnits.entityId, propertyEntities.id))
        .where(whereClause || undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(bookings).where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  async getBooking(tenantId: string, bookingId: string) {
    const [row] = await this.db
      .select({
        booking: bookings,
        deal: deals,
        lead: {
          id: leads.id,
          name: leads.name,
          email: leads.email,
          phone: leads.phone
        },
        propertyUnit: {
          id: propertyUnits.id,
          unitCode: propertyUnits.unitCode,
          unitStatus: propertyUnits.unitStatus,
          price: propertyUnits.price,
          pricePerSqft: propertyUnits.pricePerSqft
        },
        propertyEntity: {
          id: propertyEntities.id,
          name: propertyEntities.name,
          entityType: propertyEntities.entityType
        },
        createdBy: {
          id: users.id,
          name: users.name,
          email: users.email
        }
      })
      .from(bookings)
      .leftJoin(deals, eq(bookings.dealId, deals.id))
      .leftJoin(leads, eq(bookings.leadId, leads.id))
      .leftJoin(propertyUnits, eq(bookings.propertyUnitId, propertyUnits.id))
      .leftJoin(propertyEntities, eq(propertyUnits.entityId, propertyEntities.id))
      .leftJoin(users, eq(bookings.createdByUserId, users.id))
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)))
      .limit(1);

    if (!row) throw new NotFoundException('Booking not found');
    return row;
  }

  async createBooking(tenantId: string, dto: CreateBookingDto, createdByUserId?: string | null) {
    const resolved = await this.resolveBookingRelations(tenantId, dto);

    const bookingAmount = Number(dto.bookingAmount ?? resolved.deal?.pendingAmount ?? 0);
    const paidAmount = Number(dto.paidAmount ?? 0);
    if (paidAmount > bookingAmount) {
      throw new BadRequestException('Paid amount cannot be greater than booking amount');
    }

    const bookingId = randomUUID();
    const status = dto.status ?? 'draft';
    const now = new Date();

    await this.assertUnitIsFree(tenantId, resolved.propertyUnitId, status);

    let bookingNumber = '';
    await this.db.transaction(async (tx) => {
      bookingNumber = await this.documentNumbers.next(tx, tenantId, DOCUMENT_SEQUENCE.BOOKING, now);

      const dealId = await this.ensureDealForBooking(
        tx,
        tenantId,
        {
          existingDealId: resolved.deal?.id ?? null,
          leadId: resolved.leadId,
          propertyUnitId: resolved.propertyUnitId,
          quotationId: dto.quotationId ?? null,
          bookingAmount
        },
        createdByUserId
      );

      await tx.insert(bookings).values({
        id: bookingId,
        tenantId,
        dealId,
        leadId: resolved.leadId,
        propertyUnitId: resolved.propertyUnitId,
        quotationId: dto.quotationId ?? null,
        bookingNumber,
        bookingDate: new Date(dto.bookingDate),
        bookingAmount: bookingAmount.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        status,
        notes: dto.notes ?? null,
        createdByUserId: createdByUserId ?? null,
        createdAt: now,
        updatedAt: now
      });

      if (dto.milestones?.length) {
        const milestoneValues = dto.milestones.map((m, idx) => ({
          id: randomUUID(),
          tenantId,
          bookingId,
          label: m.label,
          percentage: m.percentage?.toString() || null,
          amount: m.amount.toString(),
          dueDate: m.dueDate ? new Date(m.dueDate) : null,
          sortOrder: m.sortOrder ?? idx,
          status: 'pending'
        }));
        await tx.insert(bookingMilestones).values(milestoneValues as any);
      }

      // An opening `paidAmount` (the token collected at the desk) becomes a real
      // ledger entry rather than a bare number on the booking. Without this,
      // recalcBookingFinancials below would correctly reset it to zero — the
      // ledger is the only thing that counts as money received.
      if (paidAmount > 0) {
        await tx.insert(bookingPayments).values({
          id: randomUUID(),
          tenantId,
          bookingId,
          milestoneId: null,
          amount: paidAmount.toFixed(2),
          paymentDate: new Date(dto.bookingDate),
          paymentMethod: 'opening_balance',
          transactionReference: null,
          receiptNumber: null,
          notes: `Booking amount received at creation of ${bookingNumber}`,
          status: 'cleared',
          createdAt: now
        });
      }

      await this.recalcBookingFinancials(tx, tenantId, bookingId);

      if (resolved.propertyUnitId) {
        const unitStatus = status === 'cancelled' ? 'available' : status === 'draft' ? 'blocked' : 'booked';
        await this.syncUnitStatus(tx, tenantId, resolved.propertyUnitId, unitStatus, createdByUserId, `Synced from booking ${bookingNumber}`);
      }

      if (resolved.leadId) {
        await tx.insert(leadActivities).values({
          id: randomUUID(),
          tenantId,
          leadId: resolved.leadId,
          type: 'booking',
          title: `Booking created: ${bookingNumber}`,
          note: dto.notes ?? `Booking status: ${status}`,
          metadata: { bookingId, bookingNumber, dealId: resolved.deal?.id ?? null },
          happenedAt: now,
          createdByUserId: createdByUserId ?? null,
          createdAt: now
        });
        // The pipeline move happens after the transaction via LeadPipelineService.
        // A raw statusId update used to run here too, which bypassed that
        // service's never-move-backwards guard and its activity log.
      }

      // 5. Create Document Record
      await tx.insert(propertyDocuments).values({
        id: randomUUID(),
        tenantId,
        leadId: resolved.leadId,
        propertyUnitId: resolved.propertyUnitId,
        type: 'booking_form',
        title: `Booking Confirmation: ${bookingNumber}`,
        metadata: JSON.stringify({ bookingId, bookingNumber, amount: bookingAmount }),
        createdAt: now,
        updatedAt: now
      });
    });
    const bookingResult = await this.getBooking(tenantId, bookingId);

    // Fire automation event (fire-and-forget)
    if (resolved.leadId) {
      this.automationService.fireEvent(tenantId, 'booking_created', { leadId: resolved.leadId }).catch(() => {});

      // Only a live booking is a booking. A draft is an unfinished form, and
      // marking the lead "Booking Done" for one made the pipeline report sales
      // that had not happened.
      if (BookingsService.LIVE_STATUSES.includes(status)) {
        await this.leadPipeline.advanceTo(tenantId, resolved.leadId, PIPELINE_STAGE.BOOKING_DONE, {
          actorUserId: createdByUserId,
          reason: `Booking ${bookingNumber} created.`
        });
      }
    }

    return bookingResult;
  }

  async updateBooking(tenantId: string, bookingId: string, dto: UpdateBookingDto, updatedByUserId?: string | null) {
    const existing = await this.getBooking(tenantId, bookingId);
    const bookingAmount = dto.bookingAmount !== undefined ? Number(dto.bookingAmount) : Number(existing.booking.bookingAmount ?? 0);

    // `paidAmount` is derived from the payment ledger and is not writable here.
    // Accepting it silently would let the booking total drift away from the sum
    // of its receipts — exactly the inconsistency this refactor removes.
    if (dto.paidAmount !== undefined && Number(dto.paidAmount) !== Number(existing.booking.paidAmount ?? 0)) {
      throw new BadRequestException(
        'paidAmount is derived from recorded payments. Use POST /bookings/:id/payments to record money received.'
      );
    }

    const alreadyPaid = Number(existing.booking.paidAmount ?? 0);
    if (bookingAmount > 0 && alreadyPaid > bookingAmount + 0.005) {
      throw new BadRequestException(
        `Booking amount cannot be set below the ${alreadyPaid.toFixed(2)} already received. Reverse a payment first.`
      );
    }

    const status = dto.status ?? existing.booking.status;

    if (existing.booking.propertyUnitId) {
      await this.assertUnitIsFree(tenantId, existing.booking.propertyUnitId, status, bookingId);
    }

    await this.db.transaction(async (tx) => {
      await tx.update(bookings)
        .set({
          bookingDate: dto.bookingDate ? new Date(dto.bookingDate) : existing.booking.bookingDate,
          bookingAmount: bookingAmount.toFixed(2),
          status,
          notes: dto.notes !== undefined ? dto.notes : existing.booking.notes,
          updatedAt: new Date()
        })
        .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)));

      await this.recalcBookingFinancials(tx, tenantId, bookingId);

      if (existing.booking.propertyUnitId) {
        const unitStatus = status === 'cancelled' ? 'available' : status === 'draft' ? 'blocked' : 'booked';
        await this.syncUnitStatus(tx, tenantId, existing.booking.propertyUnitId, unitStatus, updatedByUserId, `Synced from booking ${existing.booking.bookingNumber}`);
      }
    });

    // A confirmed booking is the booking stage; a completed one means the sale
    // has been executed, which is the registration stage of the journey.
    if (status !== existing.booking.status) {
      if (status === 'confirmed') {
        await this.leadPipeline.advanceTo(tenantId, existing.booking.leadId, PIPELINE_STAGE.BOOKING_DONE, {
          actorUserId: updatedByUserId,
          reason: 'Booking confirmed.'
        });
      } else if (status === 'completed') {
        await this.leadPipeline.advanceTo(tenantId, existing.booking.leadId, PIPELINE_STAGE.REGISTRATION, {
          actorUserId: updatedByUserId,
          reason: 'Booking completed.'
        });
      }
    }

    return this.getBooking(tenantId, bookingId);
  }

  /**
   * Cancels a booking. Deliberately NOT a delete.
   *
   * `booking_payments` and `booking_milestones` cascade on delete, so the old
   * implementation destroyed cleared payments — receipts, transaction
   * references, real money — with no audit trail. Cancelled bookings stay in
   * the table; the partial unique index only counts confirmed/completed ones,
   * so the unit is freed for a new buyer without losing the history.
   */
  async cancelBooking(
    tenantId: string,
    bookingId: string,
    reason?: string,
    updatedByUserId?: string | null
  ) {
    const existing = await this.getBooking(tenantId, bookingId);

    if (existing.booking.status === 'cancelled') {
      return { success: true, alreadyCancelled: true };
    }

    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx.update(bookings)
        .set({
          status: 'cancelled',
          cancelledAt: now,
          cancellationReason: reason ?? null,
          cancelledByUserId: updatedByUserId ?? null,
          updatedAt: now
        })
        .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)));

      // Put the deal back in play rather than assuming it is dead — a cancelled
      // booking often means "wrong unit", not "lost customer".
      if (existing.booking.dealId) {
        await tx.update(deals)
          .set({ status: 'on_hold', updatedAt: now })
          .where(and(eq(deals.tenantId, tenantId), eq(deals.id, existing.booking.dealId)));
      }

      if (existing.booking.propertyUnitId) {
        await this.syncUnitStatus(
          tx,
          tenantId,
          existing.booking.propertyUnitId,
          'available',
          updatedByUserId,
          `Booking ${existing.booking.bookingNumber} cancelled`
        );
      }

      if (existing.booking.leadId) {
        await tx.insert(leadActivities).values({
          id: randomUUID(),
          tenantId,
          leadId: existing.booking.leadId,
          type: 'status_change',
          title: `Booking cancelled: ${existing.booking.bookingNumber}`,
          note: reason ?? 'Booking cancelled.',
          metadata: { bookingId, bookingNumber: existing.booking.bookingNumber },
          happenedAt: now,
          createdByUserId: updatedByUserId ?? null,
          createdAt: now
        });
      }

      // Cancelling removes the booking from the deal rollup.
      await this.recalcBookingFinancials(tx, tenantId, bookingId);
    });

    return { success: true };
  }

  async getMilestones(tenantId: string, bookingId: string) {
    return this.db
      .select()
      .from(bookingMilestones)
      .where(and(eq(bookingMilestones.tenantId, tenantId), eq(bookingMilestones.bookingId, bookingId)))
      .orderBy(bookingMilestones.sortOrder);
  }

  async addPayment(tenantId: string, bookingId: string, dto: CreateBookingPaymentDto) {
    const booking = await this.getBooking(tenantId, bookingId);

    if (booking.booking.status === 'cancelled') {
      throw new BadRequestException('Cannot record a payment against a cancelled booking');
    }

    // createBooking and updateBooking both reject paid > booking amount; this
    // path did not, so payments could be pushed past the booking value.
    const [clearedRow] = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${bookingPayments.amount}), 0)` })
      .from(bookingPayments)
      .where(
        and(
          eq(bookingPayments.tenantId, tenantId),
          eq(bookingPayments.bookingId, bookingId),
          eq(bookingPayments.status, 'cleared')
        )
      );

    const alreadyPaid = Number(clearedRow?.total ?? 0);
    const bookingAmount = Number(booking.booking.bookingAmount ?? 0);
    if (bookingAmount > 0 && alreadyPaid + dto.amount > bookingAmount + 0.005) {
      throw new BadRequestException(
        `Payment of ${dto.amount} exceeds the outstanding balance of ${(bookingAmount - alreadyPaid).toFixed(2)}`
      );
    }

    if (dto.milestoneId) {
      const [milestone] = await this.db
        .select({ id: bookingMilestones.id })
        .from(bookingMilestones)
        .where(
          and(
            eq(bookingMilestones.tenantId, tenantId),
            eq(bookingMilestones.id, dto.milestoneId),
            eq(bookingMilestones.bookingId, bookingId)
          )
        )
        .limit(1);
      if (!milestone) throw new NotFoundException('Milestone not found on this booking');
    }

    const paymentId = randomUUID();
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx.insert(bookingPayments).values({
        id: paymentId,
        tenantId,
        bookingId,
        milestoneId: dto.milestoneId || null,
        amount: dto.amount.toString(),
        paymentDate: new Date(dto.paymentDate),
        paymentMethod: dto.paymentMethod,
        transactionReference: dto.transactionReference || null,
        receiptNumber: dto.receiptNumber || null,
        notes: dto.notes || null,
        status: 'cleared',
        createdAt: now
      });

      // Recompute booking paid amount, milestone statuses and deal rollup
      // from the ledger.
      await this.recalcBookingFinancials(tx, tenantId, bookingId);

      // Fire automation event (fire-and-forget)
      if (booking.booking.leadId) {
        this.automationService.fireEvent(tenantId, 'payment_received', {
          leadId: booking.booking.leadId,
          metadata: { amount: dto.amount, paymentMethod: dto.paymentMethod }
        }).catch(() => {});
      }

      // 5. Log Activity
      await tx.insert(leadActivities).values({
        id: randomUUID(),
        tenantId,
        leadId: booking.booking.leadId!,
        type: 'payment',
        title: `Payment Received: ₹${dto.amount}`,
        note: `Method: ${dto.paymentMethod} | Ref: ${dto.transactionReference || 'N/A'}`,
        metadata: { paymentId, bookingId, amount: dto.amount, method: dto.paymentMethod },
        happenedAt: now
      });

      // 6. Create Receipt Document
      await tx.insert(propertyDocuments).values({
        id: randomUUID(),
        tenantId,
        leadId: booking.booking.leadId!,
        propertyUnitId: booking.booking.propertyUnitId!,
        type: 'payment_receipt',
        title: `Payment Receipt: ${dto.receiptNumber || paymentId.substring(0, 8)}`,
        metadata: JSON.stringify({ paymentId, bookingId, amount: dto.amount, method: dto.paymentMethod }),
        createdAt: now,
        updatedAt: now
      });
    });

    return { id: paymentId, success: true };
  }

  /**
   * Reverses a payment (bounced cheque, failed transfer, refund).
   *
   * The original row is never edited or deleted — it is flagged, and the
   * derived totals are recomputed from the remaining cleared rows. That keeps
   * the ledger append-only and auditable, which is the whole point of having
   * one.
   */
  async reversePayment(
    tenantId: string,
    bookingId: string,
    paymentId: string,
    reason: string,
    actorUserId?: string | null
  ) {
    const [payment] = await this.db
      .select()
      .from(bookingPayments)
      .where(
        and(
          eq(bookingPayments.tenantId, tenantId),
          eq(bookingPayments.bookingId, bookingId),
          eq(bookingPayments.id, paymentId)
        )
      )
      .limit(1);

    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'cleared') {
      throw new BadRequestException(`Payment is already marked '${payment.status}'`);
    }

    const booking = await this.getBooking(tenantId, bookingId);
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx.update(bookingPayments)
        .set({
          status: 'reversed',
          notes: [payment.notes, `Reversed: ${reason}`].filter(Boolean).join(' | ')
        })
        .where(and(eq(bookingPayments.tenantId, tenantId), eq(bookingPayments.id, paymentId)));

      await this.recalcBookingFinancials(tx, tenantId, bookingId);

      if (booking.booking.leadId) {
        await tx.insert(leadActivities).values({
          id: randomUUID(),
          tenantId,
          leadId: booking.booking.leadId,
          type: 'payment',
          title: `Payment reversed: ₹${payment.amount}`,
          note: reason,
          metadata: { paymentId, bookingId, amount: payment.amount },
          happenedAt: now,
          createdByUserId: actorUserId ?? null,
          createdAt: now
        });
      }
    });

    return { success: true };
  }

  async listPayments(tenantId: string, query: BookingPaymentQueryDto) {
    const filters = [eq(bookingPayments.tenantId, tenantId)];
    if (query.bookingId) filters.push(eq(bookingPayments.bookingId, query.bookingId));

    return this.db
      .select()
      .from(bookingPayments)
      .where(and(...filters))
      .orderBy(desc(bookingPayments.paymentDate));
  }

  async generateDemandLetter(
    tenantId: string,
    bookingId: string,
    milestoneId?: string
  ): Promise<{ buffer: Buffer; filename: string }> {
    const bookingRow = await this.getBooking(tenantId, bookingId);

    // Fetch tenant for developer details
    const [tenant] = await this.db
      .select({ name: tenants.name, address: tenants.address })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    // Resolve milestone
    let milestone: typeof bookingMilestones.$inferSelect | null = null;
    if (milestoneId) {
      const [ms] = await this.db
        .select()
        .from(bookingMilestones)
        .where(and(eq(bookingMilestones.tenantId, tenantId), eq(bookingMilestones.id, milestoneId)))
        .limit(1);
      milestone = ms ?? null;
    } else {
      // Pick the first pending milestone
      const [ms] = await this.db
        .select()
        .from(bookingMilestones)
        .where(
          and(
            eq(bookingMilestones.tenantId, tenantId),
            eq(bookingMilestones.bookingId, bookingId),
            eq(bookingMilestones.status, 'pending')
          )
        )
        .orderBy(bookingMilestones.sortOrder)
        .limit(1);
      milestone = ms ?? null;
    }

    const fmtDate = (d: Date | string | null | undefined): string =>
      d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

    const totalAmount = Number(bookingRow.booking.bookingAmount ?? 0);
    const amountDue = milestone ? Number(milestone.amount) : totalAmount;
    const dueDate = milestone?.dueDate ? fmtDate(milestone.dueDate) : fmtDate(new Date());
    const milestoneLabel = milestone?.label ?? 'As per Agreement';

    const letterNumber = `DL-${bookingRow.booking.bookingNumber}`;

    const buffer = await generateDemandLetterPdf({
      letterNumber,
      date: fmtDate(new Date()),
      buyerName: bookingRow.lead?.name ?? 'Buyer',
      projectName: bookingRow.propertyEntity?.name ?? 'Project',
      unitNumber: bookingRow.propertyUnit?.unitCode ?? bookingRow.booking.id,
      totalAmount,
      amountDue,
      dueDate,
      milestoneLabel,
      developerName: tenant?.name ?? 'Developer',
      developerAddress: tenant?.address ?? undefined,
    });

    return {
      buffer,
      filename: `demand-letter-${bookingRow.booking.bookingNumber}.pdf`,
    };
  }

  async generateAllotmentLetter(
    tenantId: string,
    bookingId: string
  ): Promise<{ buffer: Buffer; filename: string }> {
    const bookingRow = await this.getBooking(tenantId, bookingId);

    const [tenant] = await this.db
      .select({ name: tenants.name, address: tenants.address })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const fmtDate = (d: Date | string | null | undefined): string =>
      d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

    // Fetch unit area details
    const unitDetails = bookingRow.propertyUnit
      ? await this.db
          .select({
            carpetArea: propertyUnits.carpetArea,
            reraArea: propertyUnits.reraArea,
          })
          .from(propertyUnits)
          .where(eq(propertyUnits.id, bookingRow.propertyUnit.id))
          .limit(1)
      : [];

    const unit = unitDetails[0] ?? null;

    // Fetch RERA number from entity
    const entityDetails = bookingRow.propertyEntity
      ? await this.db
          .select({ reraNumber: propertyEntities.reraNumber })
          .from(propertyEntities)
          .where(eq(propertyEntities.id, bookingRow.propertyEntity.id))
          .limit(1)
      : [];

    const entity = entityDetails[0] ?? null;

    const totalConsideration = Number(bookingRow.booking.bookingAmount ?? 0);
    const bookingAmount = Number(bookingRow.booking.paidAmount ?? 0);
    const letterNumber = `AL-${bookingRow.booking.bookingNumber}`;

    const buffer = await generateAllotmentLetterPdf({
      letterNumber,
      date: fmtDate(new Date()),
      buyerName: bookingRow.lead?.name ?? 'Buyer',
      buyerEmail: bookingRow.lead?.email ?? undefined,
      buyerPhone: bookingRow.lead?.phone ?? undefined,
      projectName: bookingRow.propertyEntity?.name ?? 'Project',
      unitNumber: bookingRow.propertyUnit?.unitCode ?? bookingRow.booking.id,
      carpetArea: unit?.carpetArea ? String(unit.carpetArea) : undefined,
      superBuiltUp: unit?.reraArea ? String(unit.reraArea) : undefined,
      totalConsideration,
      bookingAmount,
      reraNumber: entity?.reraNumber ?? undefined,
      developerName: tenant?.name ?? 'Developer',
      developerAddress: tenant?.address ?? undefined,
    });

    return {
      buffer,
      filename: `allotment-letter-${bookingRow.booking.bookingNumber}.pdf`,
    };
  }

  /**
   * Finds the deal behind a booking, creating one if the user did not supply it.
   *
   * Agents book a unit for a lead — they should never have to create a "deal"
   * first. The deal remains as the internal commercial record so quotations,
   * commissions and revenue reporting keep working, but it is provisioned here
   * rather than being a screen someone has to visit.
   */
  private async ensureDealForBooking(
    tx: DrizzleTransaction,
    tenantId: string,
    input: {
      existingDealId: string | null;
      leadId: string;
      propertyUnitId: string;
      quotationId?: string | null;
      bookingAmount: number;
    },
    createdByUserId?: string | null
  ): Promise<string> {
    if (input.existingDealId) return input.existingDealId;

    // Reuse the lead's open deal on this unit if one is already there — a
    // quotation may have created it minutes earlier.
    const [openDeal] = await (tx as DrizzleDatabase)
      .select({ id: deals.id })
      .from(deals)
      .where(
        and(
          eq(deals.tenantId, tenantId),
          eq(deals.leadId, input.leadId),
          eq(deals.propertyUnitId, input.propertyUnitId),
          inArray(deals.status, ['active', 'pending_payment', 'on_hold'])
        )
      )
      .limit(1);

    if (openDeal) return openDeal.id;

    const created = await this.dealsService.createDealInTransaction(
      tx,
      tenantId,
      {
        leadId: input.leadId,
        propertyUnitId: input.propertyUnitId,
        quotationId: input.quotationId ?? undefined,
        // Falls back to the unit price / quotation total inside the deals
        // service when the booking carries no explicit value.
        totalAmount: input.bookingAmount > 0 ? input.bookingAmount : undefined,
        notes: 'Created automatically for a booking.'
      },
      createdByUserId
    );

    return created.dealId;
  }

  private async resolveBookingRelations(tenantId: string, dto: CreateBookingDto) {
    let deal: typeof deals.$inferSelect | null = null;
    if (dto.dealId) {
      const [existingDeal] = await this.db
        .select()
        .from(deals)
        .where(and(eq(deals.tenantId, tenantId), eq(deals.id, dto.dealId)))
        .limit(1);
      if (!existingDeal) throw new NotFoundException('Deal not found');
      deal = existingDeal;
    }

    const leadId = dto.leadId ?? deal?.leadId ?? null;
    const propertyUnitId = dto.propertyUnitId ?? deal?.propertyUnitId ?? null;

    if (!leadId) throw new BadRequestException('Lead is required to create a booking');
    if (!propertyUnitId) throw new BadRequestException('Property unit is required to create a booking');

    const [lead] = await this.db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)))
      .limit(1);
    if (!lead) throw new NotFoundException('Lead not found');

    const [unit] = await this.db
      .select({ id: propertyUnits.id })
      .from(propertyUnits)
      .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, propertyUnitId)))
      .limit(1);
    if (!unit) throw new NotFoundException('Property unit not found');

    return { deal, leadId, propertyUnitId };
  }

  /**
   * Recomputes every derived money figure for a booking from the payment ledger,
   * then rolls the result up to the parent deal.
   *
   * This is the single place money is calculated. It replaces `syncDealFromBooking`,
   * which did `Math.max(deal.receivedAmount, booking.paidAmount)` — meaning a
   * second booking on the same deal did not add to the total, and a reversed
   * payment could never bring it down.
   *
   * Call it inside the transaction of anything that touches payments, milestones,
   * or booking status.
   */
  private async recalcBookingFinancials(
    tx: DrizzleExecutor,
    tenantId: string,
    bookingId: string
  ) {
    const runner = tx as DrizzleDatabase;
    const now = new Date();

    const [booking] = await runner
      .select()
      .from(bookings)
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)))
      .limit(1);

    if (!booking) return;

    // ── 1. Booking paid amount = sum of the cleared ledger ────────────────────
    const [paidRow] = await runner
      .select({ total: sql<string>`COALESCE(SUM(${bookingPayments.amount}), 0)` })
      .from(bookingPayments)
      .where(
        and(
          eq(bookingPayments.tenantId, tenantId),
          eq(bookingPayments.bookingId, bookingId),
          eq(bookingPayments.status, 'cleared')
        )
      );

    const paidAmount = Number(paidRow?.total ?? 0);

    await runner.update(bookings)
      .set({ paidAmount: paidAmount.toFixed(2), updatedAt: now })
      .where(and(eq(bookings.tenantId, tenantId), eq(bookings.id, bookingId)));

    // ── 2. Milestone statuses ────────────────────────────────────────────────
    // Previously milestones stayed 'pending' forever, so demand-letter
    // generation always picked the same one — customers were re-billed for
    // instalments they had already paid.
    const milestones = await runner
      .select()
      .from(bookingMilestones)
      .where(and(eq(bookingMilestones.tenantId, tenantId), eq(bookingMilestones.bookingId, bookingId)))
      .orderBy(bookingMilestones.sortOrder);

    for (const milestone of milestones) {
      const [allocatedRow] = await runner
        .select({ total: sql<string>`COALESCE(SUM(${bookingPayments.amount}), 0)` })
        .from(bookingPayments)
        .where(
          and(
            eq(bookingPayments.tenantId, tenantId),
            eq(bookingPayments.bookingId, bookingId),
            eq(bookingPayments.milestoneId, milestone.id),
            eq(bookingPayments.status, 'cleared')
          )
        );

      const allocated = Number(allocatedRow?.total ?? 0);
      const due = Number(milestone.amount ?? 0);
      const nextStatus = allocated <= 0 ? 'pending' : allocated + 0.005 >= due ? 'paid' : 'partial';

      if (nextStatus !== milestone.status) {
        await runner.update(bookingMilestones)
          .set({ status: nextStatus })
          .where(
            and(
              eq(bookingMilestones.tenantId, tenantId),
              eq(bookingMilestones.id, milestone.id)
            )
          );
      }
    }

    // ── 3. Roll up to the deal ───────────────────────────────────────────────
    if (!booking.dealId) return;

    const [deal] = await runner
      .select()
      .from(deals)
      .where(and(eq(deals.tenantId, tenantId), eq(deals.id, booking.dealId)))
      .limit(1);

    if (!deal) return;

    // Sum across ALL live bookings on the deal, not just the one that changed.
    const [dealPaidRow] = await runner
      .select({ total: sql<string>`COALESCE(SUM(${bookingPayments.amount}), 0)` })
      .from(bookingPayments)
      .innerJoin(bookings, eq(bookingPayments.bookingId, bookings.id))
      .where(
        and(
          eq(bookingPayments.tenantId, tenantId),
          eq(bookings.dealId, booking.dealId),
          eq(bookingPayments.status, 'cleared'),
          inArray(bookings.status, ['draft', 'confirmed', 'completed'])
        )
      );

    const receivedAmount = Number(dealPaidRow?.total ?? 0);
    const pendingAmount = Math.max(Number(deal.totalAmount ?? 0) - receivedAmount, 0);

    // Money moves the numbers, never the sales outcome. Whether a deal is won
    // stays a human decision made through DealsService.updateDeal.
    await runner.update(deals)
      .set({
        receivedAmount: receivedAmount.toFixed(2),
        pendingAmount: pendingAmount.toFixed(2),
        updatedAt: now
      })
      .where(and(eq(deals.tenantId, tenantId), eq(deals.id, booking.dealId)));
  }

  private async syncUnitStatus(
    tx: DrizzleExecutor,
    tenantId: string,
    unitId: string,
    status: 'available' | 'blocked' | 'booked' | 'sold',
    changedByUserId?: string | null,
    remarks?: string
  ) {
    const [current] = await (tx as DrizzleDatabase)
      .select({ unitStatus: propertyUnits.unitStatus })
      .from(propertyUnits)
      .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, unitId)))
      .limit(1);

    if (!current || current.unitStatus === status) return;

    await (tx as DrizzleDatabase).update(propertyUnits)
      .set({ unitStatus: status, updatedAt: new Date() })
      .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, unitId)));

    await (tx as DrizzleDatabase).insert(propertyStatusLogs).values({
      id: randomUUID(),
      tenantId,
      unitId,
      oldStatus: current.unitStatus,
      newStatus: status,
      changedByUserId: changedByUserId ?? null,
      changedAt: new Date(),
      remarks: remarks ?? null
    });
  }
}
