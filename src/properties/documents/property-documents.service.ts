import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PaginationUtil } from '../../common/utils/pagination.util';
import { eq, and, desc, sql, SQL } from 'drizzle-orm';
import { DRIZZLE } from '../../database/database.constants';
import { DrizzleDatabase } from '../../database/database.types';
import { propertyDocuments } from '../../database/schema';

@Injectable()
export class PropertyDocumentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
  ) {}

  async list(tenantId: string, query: { leadId?: string; propertyUnitId?: string; type?: string; limit?: number; page?: number }) {
    const { leadId, propertyUnitId, type, limit = 50, page = 1 } = query;
    const offset = PaginationUtil.getOffset(page, limit);

    const conditions: SQL[] = [eq(propertyDocuments.tenantId, tenantId)];
    if (leadId) conditions.push(eq(propertyDocuments.leadId, leadId));
    if (propertyUnitId) conditions.push(eq(propertyDocuments.propertyUnitId, propertyUnitId));
    if (type) conditions.push(eq(propertyDocuments.type, type as any));

    const where = and(...conditions);

    const data = await this.db
      .select()
      .from(propertyDocuments)
      .where(where)
      .orderBy(desc(propertyDocuments.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(propertyDocuments)
      .where(where);

    return {
      data,
      meta: {
        total: Number(countResult?.count || 0),
        page,
        limit
      }
    };
  }

  async findOne(tenantId: string, id: string) {
    const [doc] = await this.db
      .select()
      .from(propertyDocuments)
      .where(and(eq(propertyDocuments.id, id), eq(propertyDocuments.tenantId, tenantId)))
      .limit(1);

    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }
}
