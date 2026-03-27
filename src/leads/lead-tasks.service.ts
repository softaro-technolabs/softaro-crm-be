import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, isNotNull, lte, lt, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { leadActivities, leadTasks, leads, userTenants, users } from '../database/schema';
import { CreateLeadTaskDto, LeadTaskListQueryDto, TenantTaskListQueryDto, UpdateLeadTaskDto } from './lead-tasks.dto';

import { NotificationsService } from '../notifications/notifications.service';
import { CalendarSyncService } from '../calendar-sync/calendar-sync.service';
import { PaginationUtil } from '../common/utils/pagination.util';

@Injectable()
export class LeadTasksService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly notificationsService: NotificationsService,
    private readonly calendarSyncService: CalendarSyncService
  ) { }

  async listLeadTasks(tenantId: string, leadId: string, query: LeadTaskListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    await this.ensureLeadExists(tenantId, leadId);

    const baseFilters: SQL[] = [eq(leadTasks.tenantId, tenantId), eq(leadTasks.leadId, leadId)];

    if (!query.includeArchived) baseFilters.push(eq(leadTasks.isArchived, false));
    if (query.status) baseFilters.push(eq(leadTasks.status, query.status));
    if (query.priority) baseFilters.push(eq(leadTasks.priority, query.priority));
    if (query.assignedToUserId) baseFilters.push(eq(leadTasks.assignedToUserId, query.assignedToUserId));

    let searchFilter: SQL | null = null;
    if (query.search) {
      searchFilter = PaginationUtil.buildSearchFilter({
        fields: [leadTasks.title, leadTasks.description],
        term: query.search
      });
    }

    const allFilters = [...baseFilters];
    if (searchFilter) allFilters.push(searchFilter);

    const whereClause = PaginationUtil.buildFilters(allFilters);

    const allowedSortFields = {
      title: leadTasks.title,
      priority: leadTasks.priority,
      status: leadTasks.status,
      dueAt: leadTasks.dueAt,
      createdAt: leadTasks.createdAt,
      updatedAt: leadTasks.updatedAt
    };

    const orderBy = PaginationUtil.buildOrderBy(
      leadTasks.createdAt,
      query.sortBy,
      query.sortOrder || 'desc',
      allowedSortFields
    );

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          task: leadTasks,
          assignedTo: { id: users.id, name: users.name, email: users.email }
        })
        .from(leadTasks)
        .leftJoin(users, eq(users.id, leadTasks.assignedToUserId))
        .where(whereClause || undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(leadTasks).where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  async createLeadTask(tenantId: string, leadId: string, dto: CreateLeadTaskDto, createdByUserId?: string | null) {
    const now = new Date();
    await this.ensureLeadExists(tenantId, leadId);

    const assignedToUserId = dto.assignedToUserId
      ? await this.resolveAssignee(tenantId, dto.assignedToUserId)
      : null;

    const dueAt = dto.dueAt ? this.parseDate(dto.dueAt, 'dueAt') : null;
    const reminderAt = dto.reminderAt ? this.parseDate(dto.reminderAt, 'reminderAt') : null;

    if (reminderAt && dueAt && reminderAt.getTime() > dueAt.getTime()) {
      throw new BadRequestException('reminderAt cannot be after dueAt');
    }

    const taskId = randomUUID();

    await this.db.transaction(async (tx) => {
      await tx.insert(leadTasks).values({
        id: taskId,
        tenantId,
        leadId,
        title: dto.title,
        description: dto.description ?? null,
        status: 'open',
        priority: dto.priority ?? 'medium',
        dueAt,
        reminderAt,
        isArchived: false,
        metadata: null,
        assignedToUserId,
        createdByUserId: createdByUserId ?? null,
        completedAt: null,
        createdAt: now,
        updatedAt: now
      });

      // Log into lead timeline
      await tx.insert(leadActivities).values({
        id: randomUUID(),
        tenantId,
        leadId,
        type: 'task',
        title: 'Task created',
        note: dto.title,
        metadata: {
          taskId,
          status: 'open',
          priority: dto.priority ?? 'medium',
          dueAt: dueAt ? dueAt.toISOString() : null,
          assignedToUserId
        },
        happenedAt: now,
        nextFollowUpAt: null,
        createdByUserId: createdByUserId ?? null,
        createdAt: now
      });

      // Optional: sync lead.nextFollowUpAt
      if (dto.syncToLeadNextFollowUp && dueAt) {
        await tx
          .update(leads)
          .set({ nextFollowUpAt: dueAt, updatedAt: now })
          .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));
      }
    });

    if (assignedToUserId && assignedToUserId !== createdByUserId) {
      await this.notificationsService.createNotification(
        tenantId,
        assignedToUserId,
        'task_assigned',
        'New Task Assigned',
        `You have been assigned the task: ${dto.title}`,
        { leadId, taskId }
      );
    }

    if (assignedToUserId) {
      const taskObj = await this.getTask(tenantId, leadId, taskId);
      await this.calendarSyncService.queueSync(tenantId, assignedToUserId, taskId, 'create', taskObj.task);
    }

    return this.getTask(tenantId, leadId, taskId);
  }

  async updateLeadTask(tenantId: string, leadId: string, taskId: string, dto: UpdateLeadTaskDto, actorUserId?: string | null) {
    const now = new Date();
    const existing = await this.getTask(tenantId, leadId, taskId);

    const update: Partial<typeof leadTasks.$inferInsert> = { updatedAt: now };

    if (dto.title !== undefined) update.title = dto.title;
    if (dto.description !== undefined) update.description = dto.description ?? null;
    if (dto.priority !== undefined) update.priority = dto.priority;
    if (dto.status !== undefined) update.status = dto.status;

    if (dto.dueAt !== undefined) {
      update.dueAt = dto.dueAt === null ? null : this.parseDate(dto.dueAt, 'dueAt');
    }
    if (dto.reminderAt !== undefined) {
      update.reminderAt = dto.reminderAt === null ? null : this.parseDate(dto.reminderAt, 'reminderAt');
    }
    if (dto.assignedToUserId !== undefined) {
      update.assignedToUserId =
        dto.assignedToUserId === null
          ? null
          : await this.resolveAssignee(tenantId, dto.assignedToUserId);
    }

    // Auto completedAt
    if (dto.status === 'done' && !existing.task.completedAt) {
      update.completedAt = now;
    }
    if (dto.status && dto.status !== 'done') {
      update.completedAt = null;
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(leadTasks)
        .set(update)
        .where(and(eq(leadTasks.id, taskId), eq(leadTasks.tenantId, tenantId), eq(leadTasks.leadId, leadId)));

      await tx.insert(leadActivities).values({
        id: randomUUID(),
        tenantId,
        leadId,
        type: 'task',
        title: 'Task updated',
        note: update.title ?? existing.task.title,
        metadata: {
          taskId,
          from: {
            status: existing.task.status,
            priority: existing.task.priority,
            dueAt: existing.task.dueAt ? new Date(existing.task.dueAt).toISOString() : null,
            assignedToUserId: existing.task.assignedToUserId ?? null
          },
          to: {
            status: update.status ?? existing.task.status,
            priority: update.priority ?? existing.task.priority,
            dueAt: update.dueAt ? new Date(update.dueAt).toISOString() : existing.task.dueAt ? new Date(existing.task.dueAt).toISOString() : null,
            assignedToUserId: update.assignedToUserId ?? existing.task.assignedToUserId ?? null
          }
        },
        happenedAt: now,
        nextFollowUpAt: null,
        createdByUserId: actorUserId ?? null,
        createdAt: now
      });
    });

    if (
      update.assignedToUserId &&
      update.assignedToUserId !== existing.task.assignedToUserId &&
      update.assignedToUserId !== actorUserId
    ) {
      await this.notificationsService.createNotification(
        tenantId,
        update.assignedToUserId,
        'task_assigned',
        'Task Assigned to You',
        `You have been reassigned the task: ${update.title ?? existing.task.title}`,
        { leadId, taskId }
      );
    }

    const updatedTaskObj = await this.getTask(tenantId, leadId, taskId);
    if (updatedTaskObj.task.assignedToUserId) {
      await this.calendarSyncService.queueSync(
        tenantId,
        updatedTaskObj.task.assignedToUserId,
        taskId,
        updatedTaskObj.task.status === 'done' || updatedTaskObj.task.status === 'cancelled' ? 'delete' : 'update',
        updatedTaskObj.task
      );
    }

    return updatedTaskObj;
  }

  async archiveLeadTask(tenantId: string, leadId: string, taskId: string, actorUserId?: string | null) {
    const now = new Date();
    const existing = await this.getTask(tenantId, leadId, taskId);
    if (existing.task.isArchived) {
      return existing;
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(leadTasks)
        .set({ isArchived: true, updatedAt: now })
        .where(and(eq(leadTasks.id, taskId), eq(leadTasks.tenantId, tenantId), eq(leadTasks.leadId, leadId)));

      await tx.insert(leadActivities).values({
        id: randomUUID(),
        tenantId,
        leadId,
        type: 'task',
        title: 'Task archived',
        note: existing.task.title,
        metadata: { taskId },
        happenedAt: now,
        nextFollowUpAt: null,
        createdByUserId: actorUserId ?? null,
        createdAt: now
      });
    });

    if (existing.task.assignedToUserId) {
      await this.calendarSyncService.queueSync(tenantId, existing.task.assignedToUserId, taskId, 'delete', existing.task);
    }

    return this.getTask(tenantId, leadId, taskId);
  }

  async listTenantTasks(tenantId: string, query: TenantTaskListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const now = new Date();
    const baseFilters: SQL[] = [eq(leadTasks.tenantId, tenantId)];

    if (!query.includeArchived) baseFilters.push(eq(leadTasks.isArchived, false));
    if (query.assignedToUserId) baseFilters.push(eq(leadTasks.assignedToUserId, query.assignedToUserId));
    if (query.status) baseFilters.push(eq(leadTasks.status, query.status));

    if (query.overdue) {
      baseFilters.push(isNotNull(leadTasks.dueAt));
      baseFilters.push(lt(leadTasks.dueAt, now));
    } else if (query.due) {
      baseFilters.push(isNotNull(leadTasks.dueAt));
      if (query.withinHours) {
        const until = new Date(now.getTime() + query.withinHours * 60 * 60 * 1000);
        baseFilters.push(lte(leadTasks.dueAt, until));
      } else {
        baseFilters.push(lte(leadTasks.dueAt, now));
      }
    }

    let searchFilter: SQL | null = null;
    if (query.search) {
      searchFilter = PaginationUtil.buildSearchFilter({
        fields: [leadTasks.title, leadTasks.description],
        term: query.search
      });
    }

    const allFilters = [...baseFilters];
    if (searchFilter) allFilters.push(searchFilter);

    const whereClause = PaginationUtil.buildFilters(allFilters);

    const allowedSortFields = {
      title: leadTasks.title,
      priority: leadTasks.priority,
      status: leadTasks.status,
      dueAt: leadTasks.dueAt,
      createdAt: leadTasks.createdAt,
      updatedAt: leadTasks.updatedAt
    };

    const orderBy = PaginationUtil.buildOrderBy(
      leadTasks.createdAt,
      query.sortBy,
      query.sortOrder || 'desc',
      allowedSortFields
    );

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          task: leadTasks,
          lead: { id: leads.id, name: leads.name, phone: leads.phone, email: leads.email },
          assignedTo: { id: users.id, name: users.name, email: users.email }
        })
        .from(leadTasks)
        .innerJoin(leads, and(eq(leads.id, leadTasks.leadId), eq(leads.tenantId, tenantId)))
        .leftJoin(users, eq(users.id, leadTasks.assignedToUserId))
        .where(whereClause || undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ count: sql<number>`count(*)` }).from(leadTasks).where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  async getTask(tenantId: string, leadId: string, taskId: string) {
    const [row] = await this.db
      .select({
        task: leadTasks,
        assignedTo: { id: users.id, name: users.name, email: users.email }
      })
      .from(leadTasks)
      .leftJoin(users, eq(users.id, leadTasks.assignedToUserId))
      .where(and(eq(leadTasks.tenantId, tenantId), eq(leadTasks.leadId, leadId), eq(leadTasks.id, taskId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException('Task not found');
    }

    return row;
  }

  private async ensureLeadExists(tenantId: string, leadId: string) {
    const [row] = await this.db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))
      .limit(1);
    if (!row) {
      throw new NotFoundException('Lead not found');
    }
    return row;
  }

  private async resolveAssignee(tenantId: string, userId: string) {
    const [membership] = await this.db
      .select()
      .from(userTenants)
      .where(and(eq(userTenants.tenantId, tenantId), eq(userTenants.userId, userId)))
      .limit(1);

    if (!membership || membership.status !== 'active') {
      throw new BadRequestException('Assignee must be an active member of this tenant');
    }

    return userId;
  }

  private parseDate(value: string, field: string) {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) {
      throw new BadRequestException(`${field} must be a valid ISO date-time string`);
    }
    return dt;
  }
}


