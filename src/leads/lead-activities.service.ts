import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, isNotNull, lte, lt, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { leadActivities, leads, users } from '../database/schema';
import { CreateLeadActivityDto, LeadActivityListQueryDto, LeadFollowUpsQueryDto } from './lead-activities.dto';

@Injectable()
export class LeadActivitiesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async listLeadActivities(tenantId: string, leadId: string, query: LeadActivityListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    await this.ensureLeadExists(tenantId, leadId);

    const whereClause = and(eq(leadActivities.tenantId, tenantId), eq(leadActivities.leadId, leadId));

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          activity: leadActivities,
          createdBy: {
            id: users.id,
            name: users.name,
            email: users.email
          }
        })
        .from(leadActivities)
        .leftJoin(users, eq(users.id, leadActivities.createdByUserId))
        .where(whereClause)
        .orderBy(desc(leadActivities.happenedAt), desc(leadActivities.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(leadActivities)
        .where(whereClause)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;

    return {
      data: rows,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1
      }
    };
  }

  async createLeadActivity(tenantId: string, leadId: string, dto: CreateLeadActivityDto, createdByUserId?: string | null) {
    const lead = await this.ensureLeadExists(tenantId, leadId);
    const now = new Date();

    const happenedAt = dto.happenedAt ? this.parseDate(dto.happenedAt, 'happenedAt') : now;
    const nextFollowUpAt = dto.nextFollowUpAt ? this.parseDate(dto.nextFollowUpAt, 'nextFollowUpAt') : null;

    const markContacted =
      dto.markContacted !== undefined ? dto.markContacted : CreateLeadActivityDto.defaultMarkContacted(dto.type);

    const id = randomUUID();

    await this.db.transaction(async (tx) => {
      await tx.insert(leadActivities).values({
        id,
        tenantId,
        leadId,
        type: dto.type,
        title: dto.title ?? null,
        note: dto.note ?? null,
        happenedAt,
        nextFollowUpAt,
        createdByUserId: createdByUserId ?? null,
        createdAt: now
      });

      const leadUpdates: Partial<typeof leads.$inferInsert> = {
        updatedAt: now
      };

      if (markContacted) {
        // Only move forward in time (avoid overwriting with older history)
        const prev = lead.lastContactedAt ? new Date(lead.lastContactedAt) : null;
        if (!prev || happenedAt.getTime() >= prev.getTime()) {
          leadUpdates.lastContactedAt = happenedAt;
        }
      }

      if (nextFollowUpAt) {
        leadUpdates.nextFollowUpAt = nextFollowUpAt;
      }

      await tx
        .update(leads)
        .set(leadUpdates)
        .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));
    });

    return this.getActivityById(tenantId, id);
  }

  async listFollowUps(tenantId: string, query: LeadFollowUpsQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const now = new Date();
    const due = query.due ?? true;
    const overdue = query.overdue ?? false;

    const filters: SQL[] = [eq(leads.tenantId, tenantId), isNotNull(leads.nextFollowUpAt)];

    if (query.assignedToUserId) {
      filters.push(eq(leads.assignedToUserId, query.assignedToUserId));
    }

    if (query.search) {
      const term = `%${query.search}%`;
      const searchCondition = or(ilike(leads.name, term), ilike(leads.email, term), ilike(leads.phone, term));
      if (searchCondition) {
        filters.push(searchCondition);
      }
    }

    if (overdue) {
      filters.push(lt(leads.nextFollowUpAt, now));
    } else if (due) {
      if (query.withinHours) {
        const until = new Date(now.getTime() + query.withinHours * 60 * 60 * 1000);
        filters.push(lte(leads.nextFollowUpAt, until));
      } else {
        filters.push(lte(leads.nextFollowUpAt, now));
      }
    }

    let whereClause: SQL = filters[0];
    for (let i = 1; i < filters.length; i += 1) {
      whereClause = and(whereClause, filters[i]) as SQL;
    }

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          id: leads.id,
          name: leads.name,
          phone: leads.phone,
          email: leads.email,
          nextFollowUpAt: leads.nextFollowUpAt,
          lastContactedAt: leads.lastContactedAt,
          assignedToUserId: leads.assignedToUserId,
          assignedToName: users.name
        })
        .from(leads)
        .leftJoin(users, eq(users.id, leads.assignedToUserId))
        .where(whereClause)
        .orderBy(leads.nextFollowUpAt)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(leads).where(whereClause)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;

    return {
      data: rows.map((row) => ({
        ...row,
        name: row.name ?? '',
        assignedToName: row.assignedToName ?? null
      })),
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1
      }
    };
  }

  private async getActivityById(tenantId: string, activityId: string) {
    const [row] = await this.db
      .select({
        activity: leadActivities,
        createdBy: {
          id: users.id,
          name: users.name,
          email: users.email
        }
      })
      .from(leadActivities)
      .leftJoin(users, eq(users.id, leadActivities.createdByUserId))
      .where(and(eq(leadActivities.tenantId, tenantId), eq(leadActivities.id, activityId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException('Activity not found');
    }

    return row;
  }

  private async ensureLeadExists(tenantId: string, leadId: string) {
    const [row] = await this.db
      .select({ id: leads.id, tenantId: leads.tenantId, lastContactedAt: leads.lastContactedAt })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException('Lead not found');
    }

    return row;
  }

  private parseDate(value: string, field: string) {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO date-time string`);
    }
    return dt;
  }
}


