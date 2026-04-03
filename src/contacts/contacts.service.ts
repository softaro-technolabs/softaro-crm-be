import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { contacts, leads, deals, bookings } from '../database/schema';
import { PaginationUtil } from '../common/utils/pagination.util';

@Injectable()
export class ContactsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async listContacts(tenantId: string, query: { limit?: number; page?: number; search?: string }) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const whereFilters = [eq(contacts.tenantId, tenantId)];
    if (query.search) {
      whereFilters.push(
        or(
          ilike(contacts.name, `%${query.search}%`),
          ilike(contacts.email, `%${query.search}%`),
          ilike(contacts.phone, `%${query.search}%`)
        ) as any
      );
    }

    const whereClause = PaginationUtil.buildFilters(whereFilters);

    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(contacts)
        .where(whereClause || undefined)
        .orderBy(desc(contacts.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(contacts).where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  async getContact(tenantId: string, contactId: string) {
    const [contact] = await this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)))
      .limit(1);

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    // Get associated leads and deals for this contact
    const [associatedLeads, associatedDeals] = await Promise.all([
      this.db.select().from(leads).where(eq(leads.id, contact.leadId || '')).limit(5),
      this.db.select().from(deals).where(eq(deals.contactId, contactId)).limit(10)
    ]);

    return {
      ...contact,
      leads: associatedLeads,
      deals: associatedDeals
    };
  }
}
