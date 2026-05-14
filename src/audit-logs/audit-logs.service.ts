import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { auditLogs } from '../database/schema';
import { PaginationUtil } from '../common/utils/pagination.util';
import { RequestContextService } from '../common/utils/request-context.service';

export interface AuditLogQuery {
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  limit?: number;
  page?: number;
}

@Injectable()
export class AuditLogsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly requestContext: RequestContextService,
  ) {}

  /**
   * Write an audit log entry.
   * ipAddress and userAgent are auto-resolved from RequestContextService (HTTP request scope).
   * userId falls back to the current request user if not explicitly provided.
   * Pass userId = 'system' for AI/automated actions so it's clear it wasn't a human.
   */
  async log(
    tenantId: string,
    action: string,
    entityType: string,
    entityId?: string | null,
    changes?: Record<string, unknown> | null,
    userId?: string | null,
    meta?: Record<string, unknown> | null,
  ): Promise<void> {
    try {
      // Auto-resolve from request context if not explicitly provided
      const resolvedUserId = userId !== undefined ? userId : this.requestContext.getUserId();
      const ipAddress = this.requestContext.getIpAddress();
      const userAgent = this.requestContext.getUserAgent();

      await this.db.insert(auditLogs).values({
        id: randomUUID(),
        tenantId,
        userId: resolvedUserId ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        changes: changes ?? null,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        metadata: meta ?? null,
        createdAt: new Date()
      });
    } catch {
      // fire-and-forget: do not propagate errors to callers
    }
  }

  async findAll(tenantId: string, query: AuditLogQuery) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const baseFilters = [eq(auditLogs.tenantId, tenantId)];
    if (query.action) baseFilters.push(eq(auditLogs.action, query.action));
    if (query.entityType) baseFilters.push(eq(auditLogs.entityType, query.entityType));
    if (query.entityId) baseFilters.push(eq(auditLogs.entityId, query.entityId));
    if (query.userId) baseFilters.push(eq(auditLogs.userId, query.userId));

    const whereClause = PaginationUtil.buildFilters(baseFilters);

    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(auditLogs)
        .where(whereClause || undefined)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(auditLogs)
        .where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  async findByEntity(tenantId: string, entityType: string, entityId: string) {
    return this.db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.entityType, entityType),
          eq(auditLogs.entityId, entityId)
        )
      )
      .orderBy(desc(auditLogs.createdAt));
  }
}
