import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { siteVisits } from '../database/schema/site-visits.schema';
import { CreateSiteVisitDto, UpdateSiteVisitDto } from './site-visits.dto';
import { NotificationGateway } from '../notifications/notification.gateway';

@Injectable()
export class SiteVisitsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly notificationGateway: NotificationGateway
  ) {}

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

    await this.db.insert(siteVisits).values({
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

    this.notificationGateway.sendNotificationToTenant(tenantId, 'site_visit_scheduled', {
      id,
      leadId: dto.leadId,
      visitDate: dto.visitDate
    });

    return this.findOne(tenantId, id);
  }

  async update(tenantId: string, visitId: string, dto: UpdateSiteVisitDto) {
    const existing = await this.findOne(tenantId, visitId);
    const updateData: Partial<typeof siteVisits.$inferInsert> = {
      updatedAt: new Date()
    };

    if (dto.status) updateData.status = dto.status;
    if (dto.feedback !== undefined) updateData.feedback = dto.feedback;
    if (dto.rating !== undefined) updateData.rating = dto.rating;
    if (dto.visitDate) updateData.visitDate = new Date(dto.visitDate);
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    await this.db
      .update(siteVisits)
      .set(updateData)
      .where(and(eq(siteVisits.tenantId, tenantId), eq(siteVisits.id, visitId)));

    return this.findOne(tenantId, visitId);
  }
}
