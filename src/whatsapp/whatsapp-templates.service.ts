import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { whatsappTemplates } from '../database/schema';
import {
  CreateWhatsappTemplateDto,
  UpdateWhatsappTemplateDto,
  WhatsappTemplateListQueryDto,
} from './whatsapp.dto';

@Injectable()
export class WhatsappTemplatesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async findAll(tenantId: string, query: WhatsappTemplateListQueryDto) {
    const filters = [eq(whatsappTemplates.tenantId, tenantId)];

    if (query.status) {
      filters.push(eq(whatsappTemplates.status, query.status));
    }
    if (query.category) {
      filters.push(eq(whatsappTemplates.category, query.category));
    }
    if (query.search) {
      filters.push(
        sql`(${whatsappTemplates.name} ILIKE ${`%${query.search}%`} OR ${whatsappTemplates.displayName} ILIKE ${`%${query.search}%`})`,
      );
    }

    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const whereCondition = and(...filters);

    const [rows, countRows] = await Promise.all([
      this.db
        .select()
        .from(whatsappTemplates)
        .where(whereCondition)
        .orderBy(whatsappTemplates.createdAt)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(whatsappTemplates)
        .where(whereCondition),
    ]);

    const total = countRows.length ? Number(countRows[0].count) : 0;

    return {
      data: rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(tenantId: string, id: string) {
    const [template] = await this.db
      .select()
      .from(whatsappTemplates)
      .where(and(eq(whatsappTemplates.tenantId, tenantId), eq(whatsappTemplates.id, id)))
      .limit(1);

    if (!template) {
      throw new NotFoundException(`WhatsApp template with id "${id}" not found`);
    }
    return template;
  }

  async create(
    tenantId: string,
    dto: CreateWhatsappTemplateDto,
    userId?: string | null,
  ) {
    const id = randomUUID();
    const now = new Date();

    await this.db.insert(whatsappTemplates).values({
      id,
      tenantId,
      whatsappAccountId: dto.whatsappAccountId ?? null,
      name: dto.name,
      displayName: dto.displayName,
      category: dto.category,
      language: dto.language ?? 'en',
      status: 'pending',
      headerText: dto.headerText ?? null,
      bodyText: dto.bodyText,
      footerText: dto.footerText ?? null,
      variables: dto.variables ?? null,
      metaTemplateId: null,
      rejectionReason: null,
      isActive: true,
      createdByUserId: userId ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return this.findOne(tenantId, id);
  }

  async update(tenantId: string, id: string, dto: UpdateWhatsappTemplateDto) {
    // Verify existence
    await this.findOne(tenantId, id);

    const updateFields: Record<string, unknown> = { updatedAt: new Date() };

    if (dto.name !== undefined) updateFields.name = dto.name;
    if (dto.displayName !== undefined) updateFields.displayName = dto.displayName;
    if (dto.category !== undefined) updateFields.category = dto.category;
    if (dto.language !== undefined) updateFields.language = dto.language;
    if (dto.headerText !== undefined) updateFields.headerText = dto.headerText;
    if (dto.bodyText !== undefined) updateFields.bodyText = dto.bodyText;
    if (dto.footerText !== undefined) updateFields.footerText = dto.footerText;
    if (dto.variables !== undefined) updateFields.variables = dto.variables;
    if (dto.whatsappAccountId !== undefined) updateFields.whatsappAccountId = dto.whatsappAccountId;
    if (dto.isActive !== undefined) updateFields.isActive = dto.isActive;

    await this.db
      .update(whatsappTemplates)
      .set(updateFields as any)
      .where(and(eq(whatsappTemplates.tenantId, tenantId), eq(whatsappTemplates.id, id)));

    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    await this.db
      .delete(whatsappTemplates)
      .where(and(eq(whatsappTemplates.tenantId, tenantId), eq(whatsappTemplates.id, id)));

    return { success: true };
  }
}
