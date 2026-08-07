import { Injectable, NotFoundException, Inject, BadRequestException } from '@nestjs/common';
import { eq, and, desc, sql, or, ilike, SQL, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DrizzleDatabase } from '../database/database.types';
import { quotations, quotationItems, leads, tenants, contacts, deals, leadActivities, propertyUnits, propertyStatusLogs, propertyDocuments } from '../database/schema';
import { CreateQuotationDto, UpdateQuotationDto, QuotationListQueryDto, ConvertToDealDto } from './quotations.dto';
import { DRIZZLE } from '../database/database.constants';
import { MailService } from '../common/services/mail.service';
import { computeCostSheet, roundMoney } from '../common/utils/cost-sheet.util';
import { LeadPipelineService, PIPELINE_STAGE } from '../leads/lead-pipeline.service';
import { DOCUMENT_SEQUENCE, DocumentNumberService } from '../common/services/document-number.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { getQuotationEmailTemplate } from '../common/mail-templates/quotation-email.template';

@Injectable()
export class QuotationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly mailService: MailService,
    private readonly leadPipeline: LeadPipelineService,
    private readonly documentNumbers: DocumentNumberService,
  ) {}

  private async logActivity(tx: any, tenantId: string, leadId: string, type: any, title: string, note?: string, metadata?: any) {
    await tx.insert(leadActivities).values({
      id: uuidv4(),
      tenantId,
      leadId,
      type,
      title,
      note,
      metadata,
      happenedAt: new Date(),
    });
  }

  /**
   * Computes cost-sheet totals for a property quotation using the shared engine
   * (discount applied BEFORE tax, GST computed server-side — never trusted from the client).
   * parking / club / other charges are treated as part of the taxable agreement value.
   */
  private computeQuotationCostSheet(src: {
    basePrice?: number | string | null;
    plc?: number | string | null;
    parking?: number | string | null;
    clubMembership?: number | string | null;
    otherCharges?: any[] | null;
    gstRate?: number | string | null;
    stampDuty?: number | string | null;
    registrationCharges?: number | string | null;
    discount?: number | string | null;
  }) {
    const n = (v: unknown) => {
      const x = typeof v === 'string' ? parseFloat(v) : Number(v);
      return Number.isFinite(x) ? x : 0;
    };
    const otherTotal = Array.isArray(src.otherCharges)
      ? src.otherCharges.reduce((s, c) => s + n(c?.amount), 0)
      : 0;
    const additional = n(src.plc) + n(src.parking) + n(src.clubMembership) + otherTotal;

    return computeCostSheet({
      basePrice: n(src.basePrice),
      additionalCharges: additional,
      discount: n(src.discount),
      gstPercentage: n(src.gstRate),
      stampDutyAmount: n(src.stampDuty),
      registrationCharges: n(src.registrationCharges)
    });
  }

  private calculateTotals(items: { quantity: number; unitPrice: number; taxRate?: number; discountRate?: number }[]) {
    let subTotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;

    const processedItems = items.map((item, index) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const taxRate = Number(item.taxRate || 0);
      const discountRate = Number(item.discountRate || 0);

      const baseAmount = quantity * unitPrice;
      const discountAmount = (baseAmount * discountRate) / 100;
      const amountAfterDiscount = baseAmount - discountAmount;
      const taxAmount = (amountAfterDiscount * taxRate) / 100;
      const total = amountAfterDiscount + taxAmount;

      subTotal += baseAmount;
      discountTotal += discountAmount;
      taxTotal += taxAmount;

      return {
        ...item,
        quantity: quantity.toFixed(2),
        unitPrice: unitPrice.toFixed(2),
        taxRate: taxRate.toFixed(2),
        discountRate: discountRate.toFixed(2),
        total: total.toFixed(2),
        order: index
      };
    });

    const grandTotal = subTotal - discountTotal + taxTotal;

    return {
      subTotal: subTotal.toFixed(2),
      taxTotal: taxTotal.toFixed(2),
      discountTotal: discountTotal.toFixed(2),
      grandTotal: grandTotal.toFixed(2),
      processedItems
    };
  }

  async createQuotation(tenantId: string, dto: CreateQuotationDto) {
    const { leadId, title, expiryDate, currency, notes, terms, items, assignedToUserId, parentId } = dto;

    const [lead] = await this.db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId))).limit(1);
    if (!lead) throw new NotFoundException('Lead not found');

    let versionNumber = 1;
    if (parentId) {
      const [parent] = await this.db.select().from(quotations).where(eq(quotations.id, parentId)).limit(1);
      if (parent) {
        const [maxVersion] = await this.db
          .select({ value: sql<number>`max(version_number)` })
          .from(quotations)
          .where(eq(quotations.parentId, parentId));
        versionNumber = (maxVersion?.value || parent.versionNumber) + 1;
      }
    }

    const [countResult] = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(quotations)
      .where(eq(quotations.tenantId, tenantId));
    
    const countVal = Number(countResult?.value ?? 0);
    const quotationNumber = `QT-${new Date().getFullYear()}-${(countVal + 1).toString().padStart(4, '0')}`;

    const { 
      subTotal, 
      taxTotal: calculatedTax, 
      discountTotal: calculatedDiscount, 
      grandTotal: calculatedGrand, 
      processedItems 
    } = this.calculateTotals(items || []);

    const quotationId = uuidv4();

    // Cost-sheet path: recompute all money server-side (discount before tax, GST from rate).
    const hasCostSheet = dto.basePrice !== undefined && dto.basePrice !== null;
    const costSheet = hasCostSheet ? this.computeQuotationCostSheet(dto) : null;

    await this.db.transaction(async (tx: any) => {
      if (dto.propertyUnitId) {
        const [unit] = await tx.select().from(propertyUnits).where(eq(propertyUnits.id, dto.propertyUnitId)).limit(1);
        if (unit && (unit.unitStatus === 'sold' || unit.unitStatus === 'booked')) {
          throw new BadRequestException(`Unit ${unit.unitCode} is already ${unit.unitStatus}`);
        }
      }

      await tx.insert(quotations).values({
        id: quotationId,
        tenantId,
        leadId,
        quotationNumber,
        title,
        status: 'draft',
        issueDate: new Date(),
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        currency: currency || 'INR',
        subTotal: costSheet ? roundMoney(costSheet.agreementValue + costSheet.discount).toString() : subTotal,
        taxTotal: costSheet ? costSheet.gstAmount.toString() : calculatedTax,
        discountTotal: costSheet ? costSheet.discount.toString() : calculatedDiscount,
        grandTotal: costSheet ? costSheet.grandTotal.toString() : calculatedGrand,
        notes,
        terms,
        projectName: dto.projectName,
        unitNumber: dto.unitNumber,
        floorTower: dto.floorTower,
        unitType: dto.unitType,
        carpetArea: dto.carpetArea,
        superBuiltUp: dto.superBuiltUp,
        possession: dto.possession,
        paymentPlan: dto.paymentPlan,
        basePrice: dto.basePrice?.toString(),
        plc: dto.plc?.toString(),
        parking: dto.parking?.toString(),
        clubMembership: dto.clubMembership?.toString(),
        gstRate: dto.gstRate?.toString(),
        // Always store the server-computed GST — never the client-supplied amount.
        gstAmount: costSheet ? costSheet.gstAmount.toString() : dto.gstAmount?.toString(),
        stampDuty: dto.stampDuty?.toString(),
        registrationCharges: dto.registrationCharges?.toString(),
        discount: dto.discount?.toString(),
        otherCharges: dto.otherCharges,
        assignedToUserId: assignedToUserId || lead.assignedToUserId,
        propertyUnitId: dto.propertyUnitId,
        parentId,
        versionNumber
      });

      await this.logActivity(
        tx,
        tenantId,
        leadId,
        'quotation',
        `Quotation Created: ${quotationNumber}`,
        `Title: ${title}`,
        { quotationId, quotationNumber, grandTotal: calculatedGrand }
      );

      if (processedItems.length > 0) {
        await tx.insert(quotationItems).values(
          processedItems.map((item) => ({
            id: uuidv4(),
            quotationId,
            ...item
          }))
        );
      }

      // Record in Property Documents
      await tx.insert(propertyDocuments).values({
        id: uuidv4(),
        tenantId,
        leadId,
        propertyUnitId: dto.propertyUnitId,
        type: 'quotation',
        title: `Quotation: ${quotationNumber}`,
        metadata: JSON.stringify({ quotationId, quotationNumber, grandTotal: calculatedGrand }),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    });

    return this.getQuotation(tenantId, quotationId);
  }

  async updateQuotation(tenantId: string, id: string, dto: UpdateQuotationDto) {
    const [existing] = await this.db.select().from(quotations).where(and(eq(quotations.id, id), eq(quotations.tenantId, tenantId))).limit(1);
    if (!existing) throw new NotFoundException('Quotation not found');

    const { items, ...updates } = dto;

    await this.db.transaction(async (tx: any) => {
      if (dto.propertyUnitId && dto.propertyUnitId !== existing.propertyUnitId) {
        const [unit] = await tx.select().from(propertyUnits).where(eq(propertyUnits.id, dto.propertyUnitId)).limit(1);
        if (unit && (unit.unitStatus === 'sold' || unit.unitStatus === 'booked')) {
          throw new BadRequestException(`Unit ${unit.unitCode} is already ${unit.unitStatus}`);
        }
      }

      let finalSub = existing.subTotal;
      let finalTax = existing.taxTotal;
      let finalDiscount = existing.discountTotal;
      let finalGrand = existing.grandTotal;

      if (items) {
        const { subTotal, taxTotal, discountTotal, grandTotal, processedItems } = this.calculateTotals(items);
        finalSub = subTotal;
        finalTax = taxTotal;
        finalDiscount = discountTotal;
        finalGrand = grandTotal;

        await tx.delete(quotationItems).where(eq(quotationItems.quotationId, id));
        if (processedItems.length > 0) {
          await tx.insert(quotationItems).values(
            processedItems.map((item) => ({
              id: uuidv4(),
              quotationId: id,
              ...item
            }))
          );
        }
      }

      // If Cost Sheet fields are involved, recompute all totals server-side by merging
      // the incoming changes over the existing values, then routing through the shared engine.
      const bp = dto.basePrice !== undefined ? Number(dto.basePrice) : (existing.basePrice ? Number(existing.basePrice) : null);
      let recomputedGst: string | null = null;
      if (bp !== null) {
        const pick = (dtoVal: any, existingVal: any) => (dtoVal !== undefined ? dtoVal : existingVal);
        const costSheet = this.computeQuotationCostSheet({
          basePrice: bp,
          plc: pick(dto.plc, existing.plc),
          parking: pick(dto.parking, existing.parking),
          clubMembership: pick(dto.clubMembership, existing.clubMembership),
          otherCharges: pick(dto.otherCharges, existing.otherCharges),
          gstRate: pick(dto.gstRate, existing.gstRate),
          stampDuty: pick(dto.stampDuty, existing.stampDuty),
          registrationCharges: pick(dto.registrationCharges, existing.registrationCharges),
          discount: pick(dto.discount, existing.discount)
        });

        finalSub = roundMoney(costSheet.agreementValue + costSheet.discount).toString();
        finalTax = costSheet.gstAmount.toString();
        finalDiscount = costSheet.discount.toString();
        finalGrand = costSheet.grandTotal.toString();
        recomputedGst = costSheet.gstAmount.toString();
      }

      await tx.update(quotations).set({
        ...updates,
        // Persist the server-computed GST so the stored value and PDF always agree.
        ...(recomputedGst !== null ? { gstAmount: recomputedGst } : {}),
        subTotal: finalSub,
        taxTotal: finalTax,
        discountTotal: finalDiscount,
        grandTotal: finalGrand,
        updatedAt: new Date()
      }).where(eq(quotations.id, id));

      if (dto.status && dto.status !== existing.status) {
        await this.logActivity(
          tx,
          tenantId,
          existing.leadId,
          'quotation',
          `Quotation Status Updated: ${existing.quotationNumber}`,
          `Status changed from ${existing.status} to ${dto.status}`,
          { quotationId: id, oldStatus: existing.status, newStatus: dto.status }
        );
      }
    });

    // An accepted quotation means terms are on the table — that is Negotiation.
    if (dto.status === 'accepted' && existing.status !== 'accepted') {
      await this.leadPipeline.advanceTo(tenantId, existing.leadId, PIPELINE_STAGE.NEGOTIATION, {
        reason: `Quotation ${existing.quotationNumber ?? ''} accepted.`.trim()
      });
    }

    return this.getQuotation(tenantId, id);
  }

  async listQuotations(tenantId: string, query: QuotationListQueryDto) {
    const { search, status, leadId, page = 1, limit = 10 } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const conditions: (SQL | undefined)[] = [eq(quotations.tenantId, tenantId)];
    if (status) conditions.push(eq(quotations.status, status as any));
    if (leadId) conditions.push(eq(quotations.leadId, leadId));
    if (search) {
      conditions.push(or(ilike(quotations.title, `%${search}%`), ilike(quotations.quotationNumber, `%${search}%`)));
    }

    const whereClause = and(...conditions);

    const data = await this.db
      .select({
        id: quotations.id,
        quotationNumber: quotations.quotationNumber,
        title: quotations.title,
        status: quotations.status,
        grandTotal: quotations.grandTotal,
        issueDate: quotations.issueDate,
        leadName: leads.name
      })
      .from(quotations)
      .innerJoin(leads, eq(quotations.leadId, leads.id))
      .where(whereClause)
      .orderBy(desc(quotations.createdAt))
      .limit(Number(limit))
      .offset(skip);

    const [countResult] = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(quotations)
      .where(whereClause);

    const total = Number(countResult?.value ?? 0);

    return {
      data,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    };
  }

  async getQuotation(tenantId: string, id: string) {
    const [quotation] = await this.db
      .select()
      .from(quotations)
      .where(and(eq(quotations.id, id), eq(quotations.tenantId, tenantId)))
      .limit(1);

    if (!quotation) throw new NotFoundException('Quotation not found');

    const items = await this.db
      .select()
      .from(quotationItems)
      .where(eq(quotationItems.quotationId, id))
      .orderBy(quotationItems.order);

    const [lead] = await this.db.select().from(leads).where(eq(leads.id, quotation.leadId)).limit(1);
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);

    return {
      ...quotation,
      items,
      lead,
      tenantName: tenant?.name
    };
  }

  async deleteQuotation(tenantId: string, id: string) {
    await this.db.delete(quotations).where(and(eq(quotations.id, id), eq(quotations.tenantId, tenantId)));
    return { success: true };
  }

  async sendQuotationByEmail(tenantId: string, id: string) {
    const quotation = await this.getQuotation(tenantId, id);
    if (!quotation) throw new NotFoundException('Quotation not found');

    const lead = quotation.lead as any;
    if (!lead?.email) {
      throw new Error('Lead does not have an email address');
    }

    // 1. Generate PDF
    const pdfBuffer = await this.pdfGenerator.generateQuotationPdf(quotation);

    // 2. Prepare Email
    const fmt = (amount: any): string => {
      const num = typeof amount === 'string' ? parseFloat(amount) : amount;
      if (isNaN(num)) return '₹ 0';
      return '₹ ' + num.toLocaleString('en-IN');
    };

    const emailHtml = getQuotationEmailTemplate({
      customerName: lead.name,
      quotationNumber: quotation.quotationNumber,
      projectName: quotation.projectName || 'Proposed Project',
      unitNumber: quotation.unitNumber || 'N/A',
      amount: fmt(quotation.grandTotal),
      senderName: quotation.tenantName || 'Sales Team',
      companyName: quotation.tenantName || 'Softaro CRM',
      expiryDate: quotation.expiryDate ? new Date(quotation.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : undefined
    });

    // 3. Send Email
    const fileName = `${quotation.quotationNumber}.pdf`;
    await this.mailService.sendQuotationEmail(
      lead.email,
      `Quotation ${quotation.quotationNumber} — ${quotation.projectName || 'Softaro CRM'}`,
      emailHtml,
      pdfBuffer,
      fileName
    );

    // 4. Update status if it's draft
    if (quotation.status === 'draft') {
      await this.db.update(quotations)
        .set({ status: 'sent', updatedAt: new Date() })
        .where(eq(quotations.id, id));

      await this.logActivity(
        this.db,
        tenantId,
        quotation.leadId,
        'email',
        `Quotation Emailed: ${quotation.quotationNumber}`,
        `Sent to ${lead.email}`,
        { quotationId: id }
      );
    }

    return { success: true, message: 'Quotation sent successfully' };
  }

  /**
   * Create a new version of an existing quotation
   */
  async createRevision(tenantId: string, id: string) {
    const original = await this.getQuotation(tenantId, id);
    if (!original) throw new NotFoundException('Quotation not found');

    const parentId = original.parentId || original.id;
    
    const [maxVersion] = await this.db
      .select({ value: sql<number>`max(version_number)` })
      .from(quotations)
      .where(or(eq(quotations.id, parentId), eq(quotations.parentId, parentId)));
    
    const nextVersion = (Number(maxVersion?.value) || 1) + 1;

    const { items, lead, tenantName, ...data } = original;

    const newId = uuidv4();
    const newNumber = `${original.quotationNumber.split('-v')[0]}-v${nextVersion}`;

    await this.db.transaction(async (tx: any) => {
      await tx.insert(quotations).values({
        ...data,
        id: newId,
        quotationNumber: newNumber,
        status: 'draft',
        versionNumber: nextVersion,
        parentId: parentId,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      if (items && items.length > 0) {
        await tx.insert(quotationItems).values(
          items.map(item => ({
            ...item,
            id: uuidv4(),
            quotationId: newId,
            createdAt: new Date(),
            updatedAt: new Date()
          }))
        );
      }

      await this.logActivity(
        tx,
        tenantId,
        original.leadId,
        'quotation',
        `New Revision Created: ${newNumber}`,
        `Revised from ${original.quotationNumber}`,
        { quotationId: newId, parentId, versionNumber: nextVersion }
      );
    });

    return this.getQuotation(tenantId, newId);
  }

  /**
   * Convert a Quotation into a Deal and create a Contact for the Lead
   */
  async convertToDeal(tenantId: string, id: string, dto: ConvertToDealDto) {
    const quotation = await this.getQuotation(tenantId, id);
    if (!quotation) throw new NotFoundException('Quotation not found');
    if (quotation.status === 'converted') throw new Error('Quotation already converted');

    const lead = quotation.lead as any;
    
    return await this.db.transaction(async (tx: any) => {
      // 1. Check if contact exists, if not create one
      let contactId = quotation.contactId;
      if (!contactId) {
        contactId = uuidv4();
        await tx.insert(contacts).values({
          id: contactId,
          tenantId,
          leadId: lead.id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      // 2. Create the Deal
      // Shares DocumentNumberService with DealsService so both conversion routes
      // draw from one counter and cannot issue the same deal number.
      const dealNumber = await this.documentNumbers.next(tx, tenantId, DOCUMENT_SEQUENCE.DEAL);
      const dealId = uuidv4();

      await tx.insert(deals).values({
        id: dealId,
        tenantId,
        leadId: lead.id,
        contactId,
        quotationId: id,
        propertyUnitId: quotation.propertyUnitId,
        dealNumber,
        status: 'active',
        totalAmount: quotation.grandTotal,
        receivedAmount: dto.receivedAmount?.toString() || '0',
        pendingAmount: (Number(quotation.grandTotal) - Number(dto.receivedAmount || 0)).toString(),
        expectedClosingDate: new Date(dto.expectedClosingDate),
        notes: dto.notes,
        assignedToUserId: quotation.assignedToUserId,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // 3. Update Quotation Status
      await tx.update(quotations)
        .set({ 
          status: 'converted', 
          contactId,
          updatedAt: new Date() 
        })
        .where(eq(quotations.id, id));
      
      // 4. Block the unit for this deal.
      //    Previously this wrote 'booked' with no tenant filter and no status
      //    log, so the same event left the unit in a different state depending
      //    on which conversion route ran. A deal blocks a unit; only a
      //    confirmed booking books it.
      if (quotation.propertyUnitId) {
        const [currentUnit] = await tx
          .select({ unitStatus: propertyUnits.unitStatus })
          .from(propertyUnits)
          .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, quotation.propertyUnitId)))
          .limit(1);

        if (currentUnit && currentUnit.unitStatus !== 'blocked') {
          await tx.update(propertyUnits)
            .set({ unitStatus: 'blocked', updatedAt: new Date() })
            .where(and(eq(propertyUnits.tenantId, tenantId), eq(propertyUnits.id, quotation.propertyUnitId)));

          await tx.insert(propertyStatusLogs).values({
            id: uuidv4(),
            tenantId,
            unitId: quotation.propertyUnitId,
            oldStatus: currentUnit.unitStatus,
            newStatus: 'blocked',
            changedByUserId: null,
            changedAt: new Date(),
            remarks: `Blocked for deal ${dealNumber} (from quotation ${quotation.quotationNumber})`
          });
        }
      }

      // 5. Log Activity
      await this.logActivity(
        tx,
        tenantId,
        lead.id,
        'quotation',
        `Quotation Converted to Deal: ${quotation.quotationNumber}`,
        `New Deal: ${dealNumber}`,
        { quotationId: id, dealId, dealNumber }
      );

      // Commission is NOT accrued here. A quotation being converted is not a
      // sale — the partner earns when the booking goes live, which is where
      // BookingCommissionsService.accrueForBooking runs.
      return { success: true, dealId, dealNumber, contactId };
    });
  }
}
