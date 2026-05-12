import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { callLogs } from '../database/schema';
import { PaginationUtil } from '../common/utils/pagination.util';
import {
  CallLogListQueryDto,
  CallDirection,
  CallStatus,
  CreateCallLogDto,
  ExotelWebhookDto
} from './call-logs.dto';

@Injectable()
export class CallLogsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async create(tenantId: string, dto: CreateCallLogDto) {
    const id = randomUUID();
    const now = new Date();

    await this.db.insert(callLogs).values({
      id,
      tenantId,
      leadId: dto.leadId ?? null,
      agentUserId: dto.agentUserId ?? null,
      direction: dto.direction,
      status: dto.status,
      callSid: dto.callSid ?? null,
      providerName: dto.providerName ?? null,
      fromNumber: dto.fromNumber,
      toNumber: dto.toNumber,
      duration: dto.duration ?? null,
      recordingUrl: dto.recordingUrl ?? null,
      notes: dto.notes ?? null,
      metadata: dto.metadata ?? null,
      startedAt: dto.startedAt ? new Date(dto.startedAt) : null,
      endedAt: dto.endedAt ? new Date(dto.endedAt) : null,
      createdAt: now
    });

    const [row] = await this.db
      .select()
      .from(callLogs)
      .where(and(eq(callLogs.tenantId, tenantId), eq(callLogs.id, id)))
      .limit(1);

    return row;
  }

  async findAll(tenantId: string, query: CallLogListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const baseFilters = [eq(callLogs.tenantId, tenantId)];
    if (query.leadId) baseFilters.push(eq(callLogs.leadId, query.leadId));
    if (query.agentUserId) baseFilters.push(eq(callLogs.agentUserId, query.agentUserId));
    if (query.direction) baseFilters.push(eq(callLogs.direction, query.direction));
    if (query.status) baseFilters.push(eq(callLogs.status, query.status));

    const whereClause = PaginationUtil.buildFilters(baseFilters);

    const allowedSortFields = {
      createdAt: callLogs.createdAt,
      startedAt: callLogs.startedAt,
      endedAt: callLogs.endedAt,
      duration: callLogs.duration
    };

    const orderBy = PaginationUtil.buildOrderBy(
      callLogs.createdAt,
      query.sortBy,
      query.sortOrder || 'desc',
      allowedSortFields
    );

    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(callLogs)
        .where(whereClause || undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(callLogs)
        .where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  async findByLead(tenantId: string, leadId: string) {
    return this.db
      .select()
      .from(callLogs)
      .where(and(eq(callLogs.tenantId, tenantId), eq(callLogs.leadId, leadId)))
      .orderBy(desc(callLogs.createdAt));
  }

  async handleExotelWebhook(tenantId: string, body: ExotelWebhookDto) {
    const direction = this.mapExotelDirection(body.Direction);
    const status = this.mapExotelStatus(body.Status);

    const dto: CreateCallLogDto = {
      direction,
      status,
      fromNumber: body.From ?? 'unknown',
      toNumber: body.To ?? 'unknown',
      callSid: body.CallSid,
      providerName: 'exotel',
      duration: body.Duration ? parseInt(body.Duration, 10) : undefined,
      recordingUrl: body.RecordingUrl,
      startedAt: body.AnswerTime ?? body.StartTime,
      endedAt: body.EndTime,
      metadata: {
        raw: body
      }
    };

    return this.create(tenantId, dto);
  }

  private mapExotelDirection(direction?: string): CallDirection {
    if (!direction) return 'inbound';
    const lower = direction.toLowerCase();
    if (lower === 'outbound' || lower === 'outbound-api' || lower === 'outbound-dial') {
      return 'outbound';
    }
    return 'inbound';
  }

  private mapExotelStatus(status?: string): CallStatus {
    if (!status) return 'failed';
    const lower = status.toLowerCase();

    const statusMap: Record<string, CallStatus> = {
      completed: 'completed',
      answered: 'completed',
      'no-answer': 'no_answer',
      'no_answer': 'no_answer',
      busy: 'busy',
      failed: 'failed',
      missed: 'missed'
    };

    return statusMap[lower] ?? 'failed';
  }
}
