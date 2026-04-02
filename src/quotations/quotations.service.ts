import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { eq, and, desc, sql, or, ilike, SQL } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DrizzleDatabase } from '../database/database.types';
import { quotations, quotationItems, leads } from '../database/schema';
import { CreateQuotationDto, UpdateQuotationDto, QuotationListQueryDto } from './quotations.dto';

@Injectable()
export class QuotationsService {
  constructor(@Inject('DATABASE') private readonly db: DrizzleDatabase) {}

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
    const { leadId, title, expiryDate, currency, notes, terms, items } = dto;

    const [lead] = await this.db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId))).limit(1);
    if (!lead) throw new NotFoundException('Lead not found');

    const [countResult] = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(quotations)
      .where(eq(quotations.tenantId, tenantId));
    
    const countVal = Number(countResult?.value ?? 0);
    const quotationNumber = `QT-${new Date().getFullYear()}-${(countVal + 1).toString().padStart(4, '0')}`;

    const { subTotal, taxTotal, discountTotal, grandTotal, processedItems } = this.calculateTotals(items);

    const quotationId = uuidv4();

    await this.db.transaction(async (tx: any) => {
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
        subTotal,
        taxTotal,
        discountTotal,
        grandTotal,
        notes,
        terms
      });

      if (processedItems.length > 0) {
        await tx.insert(quotationItems).values(
          processedItems.map((item) => ({
            id: uuidv4(),
            quotationId,
            ...item
          }))
        );
      }
    });

    return this.getQuotation(tenantId, quotationId);
  }

  async updateQuotation(tenantId: string, id: string, dto: UpdateQuotationDto) {
    const [existing] = await this.db.select().from(quotations).where(and(eq(quotations.id, id), eq(quotations.tenantId, tenantId))).limit(1);
    if (!existing) throw new NotFoundException('Quotation not found');

    const { items, ...updates } = dto;

    await this.db.transaction(async (tx: any) => {
      if (items) {
        const { subTotal, taxTotal, discountTotal, grandTotal, processedItems } = this.calculateTotals(items);
        
        await tx.update(quotations).set({
          ...updates,
          subTotal,
          taxTotal,
          discountTotal,
          grandTotal,
          updatedAt: new Date()
        }).where(eq(quotations.id, id));

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
      } else {
        await tx.update(quotations).set({
          ...updates,
          updatedAt: new Date()
        }).where(eq(quotations.id, id));
      }
    });

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

    return {
      ...quotation,
      items,
      lead
    };
  }

  async deleteQuotation(tenantId: string, id: string) {
    await this.db.delete(quotations).where(and(eq(quotations.id, id), eq(quotations.tenantId, tenantId)));
    return { success: true };
  }
}
