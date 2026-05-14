import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { siteVisits, leadActivities, leads, leadStatuses } from '../database/schema';
import { CreateSiteVisitDto, UpdateSiteVisitDto } from './site-visits.dto';
import { NotificationGateway } from '../notifications/notification.gateway';
import { AutomationService } from '../automation/automation.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AUDIT_ACTIONS } from '../audit-logs/audit-actions.constants';
import { RequestContextService } from '../common/utils/request-context.service';

@Injectable()
export class SiteVisitsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly notificationGateway: NotificationGateway,
    private readonly automationService: AutomationService,
    private readonly auditLogsService: AuditLogsService,
    private readonly requestContext: RequestContextService,
  ) {}

  private async resolveStatusIdBySlug(tenantId: string, slug: string): Promise<string | null> {
    const [status] = await this.db
      .select({ id: leadStatuses.id })
      .from(leadStatuses)
      .where(and(eq(leadStatuses.tenantId, tenantId), eq(leadStatuses.slug, slug)))
      .limit(1);
    return status?.id ?? null;
  }

  async list(tenantId: string, leadId?: string) {
    const filters = [eq(siteVisits.tenantId, tenantId)];
    if (leadId) {
      filters.push(eq(siteVisits.leadId, leadId));
    }

    return this.db
      .select()
      .from(siteVisits)
      .where(and(...filters))
      .orderBy(desc(siteVisits.visitDate));
  }

  async findOne(tenantId: string, visitId: string) {
    const [visit] = await this.db
      .select()
      .from(siteVisits)
      .where(and(eq(siteVisits.tenantId, tenantId), eq(siteVisits.id, visitId)))
      .limit(1);

    if (!visit) {
      throw new NotFoundException('Site visit not found');
    }
    return visit;
  }

  async create(tenantId: string, dto: CreateSiteVisitDto) {
    const id = randomUUID();
    const now = new Date();

    await this.db.transaction(async (tx) => {
      // 1. Insert Site Visit
      await tx.insert(siteVisits).values({
        id,
        tenantId,
        leadId: dto.leadId,
        propertyId: dto.propertyId,
        assignedToUserId: dto.assignedToUserId,
        visitDate: new Date(dto.visitDate),
        notes: dto.notes,
        createdAt: now,
        updatedAt: now
      });

      // 2. Record in Lead Timeline
      await tx.insert(leadActivities).values({
        id: randomUUID(),
        tenantId,
        leadId: dto.leadId,
        type: 'meeting',
        title: 'Site Visit Scheduled',
        note: dto.notes || 'A site visit has been scheduled.',
        metadata: {
          siteVisitId: id,
          visitDate: dto.visitDate
        },
        happenedAt: now,
        createdByUserId: dto.assignedToUserId || null,
        createdAt: now
      });

      // 3. Update Lead Status to 'Site Visit Scheduled'
      const statusId = await this.resolveStatusIdBySlug(tenantId, 'site_visit_scheduled');
      if (statusId) {
        await tx.update(leads)
          .set({ statusId, updatedAt: now })
          .where(and(eq(leads.id, dto.leadId), eq(leads.tenantId, tenantId)));
      }
    });

    this.notificationGateway.sendNotificationToTenant(tenantId, 'site_visit_scheduled', {
      id,
      leadId: dto.leadId,
      visitDate: dto.visitDate
    });

    // Fire automation event (fire-and-forget)
    this.automationService.fireEvent(tenantId, 'site_visit_scheduled', { leadId: dto.leadId }).catch(() => {});

    this.auditLogsService.log(
      tenantId, AUDIT_ACTIONS.SITE_VISIT_CREATED, 'site_visit', id,
      { leadId: dto.leadId, propertyId: dto.propertyId, visitDate: dto.visitDate },
      this.requestContext.getUserId(),
    ).catch(() => {});

    return this.findOne(tenantId, id);
  }

  async update(tenantId: string, visitId: string, dto: UpdateSiteVisitDto) {
    const existing = await this.findOne(tenantId, visitId);
    const now = new Date();
    const updateData: Partial<typeof siteVisits.$inferInsert> = {
      updatedAt: now
    };

    if (dto.status) updateData.status = dto.status;
    if (dto.feedback !== undefined) updateData.feedback = dto.feedback;
    if (dto.rating !== undefined) updateData.rating = dto.rating;
    if (dto.visitDate) updateData.visitDate = new Date(dto.visitDate);
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    await this.db.transaction(async (tx) => {
      // 1. Update Site Visit
      await tx
        .update(siteVisits)
        .set(updateData)
        .where(and(eq(siteVisits.tenantId, tenantId), eq(siteVisits.id, visitId)));

      // 2. Log Activity based on what changed
      let activityTitle = '';
      let activityNote = '';
      let activityType: any = 'meeting';
      let nextStatusSlug = '';

      if (dto.status && dto.status !== existing.status) {
        if (dto.status === 'completed') {
          activityTitle = 'Site Visit Completed';
          activityNote = dto.feedback || 'The property tour has been successfully completed.';
          nextStatusSlug = 'site_visit_done';
        } else if (dto.status === 'cancelled') {
          activityTitle = 'Site Visit Cancelled';
          activityNote = dto.notes || 'The scheduled property tour was cancelled.';
          activityType = 'note';
        } else if (dto.status === 'no_show') {
          activityTitle = 'Site Visit: No Show';
          activityNote = 'Lead did not show up for the scheduled tour.';
          activityType = 'note';
        }
      } else if (dto.visitDate && new Date(dto.visitDate).getTime() !== new Date(existing.visitDate).getTime()) {
        activityTitle = 'Site Visit Rescheduled';
        activityNote = `Date changed from ${new Date(existing.visitDate).toLocaleString()} to ${new Date(dto.visitDate).toLocaleString()}`;
        nextStatusSlug = 'site_visit_scheduled';
      }

      if (activityTitle) {
        await tx.insert(leadActivities).values({
          id: randomUUID(),
          tenantId,
          leadId: existing.leadId,
          type: activityType,
          title: activityTitle,
          note: activityNote,
          metadata: {
            siteVisitId: visitId,
            prevStatus: existing.status,
            newStatus: dto.status || existing.status,
            newDate: dto.visitDate || existing.visitDate
          },
          happenedAt: now,
          createdAt: now
        });
      }

      // 3. Automated Status Transition
      if (nextStatusSlug) {
        const statusId = await this.resolveStatusIdBySlug(tenantId, nextStatusSlug);
        if (statusId) {
          await tx.update(leads)
            .set({ statusId, updatedAt: now })
            .where(and(eq(leads.id, existing.leadId), eq(leads.tenantId, tenantId)));
        }
      }
    });

    // Fire automation events based on new status (fire-and-forget)
    if (dto.status && dto.status !== existing.status) {
      if (dto.status === 'completed') {
        this.automationService.fireEvent(tenantId, 'site_visit_done', { leadId: existing.leadId }).catch(() => {});
      } else if (dto.status === 'no_show') {
        this.automationService.fireEvent(tenantId, 'site_visit_no_show', { leadId: existing.leadId }).catch(() => {});
      }
    }

    const action = dto.status === 'completed'
      ? AUDIT_ACTIONS.SITE_VISIT_COMPLETED
      : AUDIT_ACTIONS.SITE_VISIT_UPDATED;

    this.auditLogsService.log(
      tenantId, action, 'site_visit', visitId,
      { leadId: existing.leadId, status: dto.status, visitDate: dto.visitDate },
      this.requestContext.getUserId(),
    ).catch(() => {});

    return this.findOne(tenantId, visitId);
  }
}
