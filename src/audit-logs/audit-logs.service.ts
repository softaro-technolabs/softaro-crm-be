import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { auditLogs, users, leads, leadStatuses, roles } from '../database/schema';
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
    const enriched = await this.enrichRows(tenantId, rows);
    return PaginationUtil.buildPaginatedResult(enriched, total, page, limit);
  }

  // ─── ID → Name resolution ───────────────────────────────────────────────────

  private async enrichRows(tenantId: string, rows: (typeof auditLogs.$inferSelect)[]) {
    if (rows.length === 0) return rows;

    // Collect every ID that needs resolving
    const userIdSet   = new Set<string>();
    const statusIdSet = new Set<string>();
    const leadIdSet   = new Set<string>();
    const roleIdSet   = new Set<string>();

    for (const row of rows) {
      if (row.userId && row.userId !== 'system') userIdSet.add(row.userId);
      if (row.entityId) {
        if (row.entityType === 'lead')  leadIdSet.add(row.entityId);
        if (row.entityType === 'user')  userIdSet.add(row.entityId);
      }
      this.collectIds(row.changes as Record<string, unknown> | null, userIdSet, statusIdSet, roleIdSet);
    }

    // Batch-fetch lookup maps
    const [userMap, statusMap, leadMap, roleMap] = await Promise.all([
      this.fetchUsers(Array.from(userIdSet)),
      this.fetchStatuses(tenantId, Array.from(statusIdSet)),
      this.fetchLeads(tenantId, Array.from(leadIdSet)),
      this.fetchRoles(Array.from(roleIdSet)),
    ]);

    return rows.map(row => {
      const actorName =
        row.userId === 'system'
          ? 'System (AI / Automation)'
          : row.userId
            ? (userMap.get(row.userId) ?? null)
            : null;

      let entityName: string | null = null;
      if (row.entityId) {
        if (row.entityType === 'lead')  entityName = leadMap.get(row.entityId) ?? null;
        if (row.entityType === 'user')  entityName = userMap.get(row.entityId)  ?? null;
      }

      const resolved = this.buildResolved(
        row.changes as Record<string, unknown> | null,
        userMap, statusMap, roleMap
      );

      return { ...row, actorName, entityName, resolved };
    });
  }

  /** Scan a changes object (flat or {before,after}) and collect IDs */
  private collectIds(
    changes: Record<string, unknown> | null,
    userIds: Set<string>,
    statusIds: Set<string>,
    roleIds: Set<string>,
  ) {
    if (!changes) return;
    const scan = (obj: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v !== 'string' || !v) continue;
        if (k.endsWith('UserId'))   userIds.add(v);
        if (k.endsWith('StatusId')) statusIds.add(v);
        if (k === 'roleId')         roleIds.add(v);
      }
    };
    if ('before' in changes || 'after' in changes) {
      if (changes.before && typeof changes.before === 'object') scan(changes.before as Record<string, unknown>);
      if (changes.after  && typeof changes.after  === 'object') scan(changes.after  as Record<string, unknown>);
    } else {
      scan(changes);
    }
  }

  /** Build a flat { fieldName: resolvedName } map for a single log's changes */
  private buildResolved(
    changes: Record<string, unknown> | null,
    userMap:   Map<string, string>,
    statusMap: Map<string, string>,
    roleMap:   Map<string, string>,
  ): Record<string, string> | null {
    if (!changes) return null;
    const out: Record<string, string> = {};

    const resolve = (k: string, v: unknown) => {
      if (typeof v !== 'string' || !v) return;
      if (k.endsWith('UserId')   && userMap.has(v))   out[k] = userMap.get(v)!;
      if (k.endsWith('StatusId') && statusMap.has(v)) out[k] = statusMap.get(v)!;
      if (k === 'roleId'         && roleMap.has(v))   out[k] = roleMap.get(v)!;
    };

    if ('before' in changes || 'after' in changes) {
      for (const side of ['before', 'after'] as const) {
        const obj = changes[side];
        if (obj && typeof obj === 'object') {
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) resolve(k, v);
        }
      }
    } else {
      for (const [k, v] of Object.entries(changes)) resolve(k, v);
    }

    return Object.keys(out).length ? out : null;
  }

  // ── Batch fetchers ─────────────────────────────────────────────────────────

  private async fetchUsers(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, ids));
    return new Map(rows.map(r => [r.id, r.name]));
  }

  private async fetchStatuses(tenantId: string, ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.db
      .select({ id: leadStatuses.id, name: leadStatuses.name })
      .from(leadStatuses)
      .where(and(eq(leadStatuses.tenantId, tenantId), inArray(leadStatuses.id, ids)));
    return new Map(rows.map(r => [r.id, r.name]));
  }

  private async fetchLeads(tenantId: string, ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.db
      .select({ id: leads.id, name: leads.name })
      .from(leads)
      .where(and(eq(leads.tenantId, tenantId), inArray(leads.id, ids)));
    return new Map(rows.map(r => [r.id, r.name ?? r.id]));
  }

  private async fetchRoles(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.db
      .select({ id: roles.id, name: roles.name })
      .from(roles)
      .where(inArray(roles.id, ids));
    return new Map(rows.map(r => [r.id, r.name]));
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
