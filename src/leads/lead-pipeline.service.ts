import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { leadActivities, leadStatuses, leads } from '../database/schema';
import { AutomationService } from '../automation/automation.service';
import { LEAD_PIPELINE_RANK } from './leads.service';

/** Canonical stage slugs other modules advance a lead into. */
export const PIPELINE_STAGE = {
  QUALIFIED: 'qualified',
  NEGOTIATION: 'negotiation',
  BOOKING_DONE: 'booking_done',
  REGISTRATION: 'registration',
  POSSESSION: 'possession'
} as const;

/**
 * Moves leads along the pipeline in response to what happens elsewhere in the
 * system — a quotation being accepted, a deal being won, a booking confirmed.
 *
 * Before this existed, only site visits advanced a lead; every other stage
 * relied on an agent remembering to drag a card, so pipeline reports drifted
 * away from reality.
 */
@Injectable()
export class LeadPipelineService {
  private readonly logger = new Logger(LeadPipelineService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly automationService: AutomationService
  ) {}

  /**
   * Advances `leadId` to `targetSlug` when that is forward progress.
   *
   * Never moves a lead backwards: a booked lead does not return to Negotiation
   * because someone edited an old quotation. Leads sitting on a loss reason are
   * off-ladder and *are* moved, since a revived lead that books must reflect it.
   *
   * Fire-and-forget by design — a pipeline update must never fail the booking
   * or payment that triggered it.
   */
  async advanceTo(
    tenantId: string,
    leadId: string | null | undefined,
    targetSlug: string,
    options: { actorUserId?: string | null; reason?: string } = {}
  ): Promise<boolean> {
    if (!leadId) return false;

    try {
      const [lead] = await this.db
        .select({ id: leads.id, statusId: leads.statusId })
        .from(leads)
        .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))
        .limit(1);

      if (!lead) return false;

      const [target] = await this.db
        .select({ id: leadStatuses.id, name: leadStatuses.name, slug: leadStatuses.slug })
        .from(leadStatuses)
        .where(and(eq(leadStatuses.tenantId, tenantId), eq(leadStatuses.slug, targetSlug)))
        .limit(1);

      // The tenant may have removed this stage from their pipeline — respect that.
      if (!target) return false;
      if (lead.statusId === target.id) return false;

      let currentSlug: string | null = null;
      if (lead.statusId) {
        const [current] = await this.db
          .select({ slug: leadStatuses.slug })
          .from(leadStatuses)
          .where(eq(leadStatuses.id, lead.statusId))
          .limit(1);
        currentSlug = current?.slug ?? null;
      }

      const currentRank = currentSlug === null ? -1 : LEAD_PIPELINE_RANK[currentSlug];
      const targetRank = LEAD_PIPELINE_RANK[targetSlug];

      // Both on the ladder: only move forward.
      if (currentRank !== undefined && targetRank !== undefined && currentRank >= targetRank) {
        return false;
      }

      const now = new Date();
      await this.db
        .update(leads)
        .set({ statusId: target.id, updatedAt: now })
        .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));

      await this.db.insert(leadActivities).values({
        id: randomUUID(),
        tenantId,
        leadId,
        type: 'note',
        title: `Stage moved to ${target.name}`,
        note: options.reason ?? `Automatically advanced to ${target.name}.`,
        metadata: {
          automatic: true,
          fromStatusSlug: currentSlug,
          toStatusSlug: target.slug
        },
        happenedAt: now,
        nextFollowUpAt: null,
        createdByUserId: options.actorUserId ?? null,
        createdAt: now
      });

      this.automationService
        .fireEvent(tenantId, 'lead_status_changed', { leadId })
        .catch(() => {});

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to advance lead ${leadId} to ${targetSlug}: ${(error as Error).message}`
      );
      return false;
    }
  }
}
