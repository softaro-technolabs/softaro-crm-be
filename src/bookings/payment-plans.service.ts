import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { paymentPlanTemplateItems, paymentPlanTemplates } from '../database/schema';
import { CreatePaymentPlanDto, UpdatePaymentPlanDto } from './payment-plans.dto';

/**
 * Reusable payment schedules — "construction linked", "down payment",
 * "possession linked".
 *
 * Scoped per project so a plan can differ between towers; a template with no
 * `entityId` is a tenant-wide default available everywhere.
 */
@Injectable()
export class PaymentPlansService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  /**
   * Standard Indian residential payment plans, seeded on first use.
   *
   * Without these `paymentPlanTemplateId` has nothing to point at, and every
   * new tenant has to build a schedule by hand before they can take a booking.
   */
  private static readonly DEFAULT_TEMPLATES = [
    {
      name: 'Construction Linked Plan',
      description: 'Instalments fall due as construction milestones are reached.',
      isDefault: true,
      items: [
        { label: 'On booking', percentage: 10 },
        { label: 'On agreement', percentage: 20 },
        { label: 'On completion of plinth', percentage: 15 },
        { label: 'On completion of 3rd slab', percentage: 15 },
        { label: 'On completion of 7th slab', percentage: 15 },
        { label: 'On completion of brickwork', percentage: 10 },
        { label: 'On completion of flooring', percentage: 10 },
        { label: 'On possession', percentage: 5 }
      ]
    },
    {
      name: 'Down Payment Plan',
      description: 'Majority paid up front, usually against a price discount.',
      isDefault: false,
      items: [
        { label: 'On booking', percentage: 10, dueOffsetDays: 0 },
        { label: 'Within 30 days', percentage: 85, dueOffsetDays: 30 },
        { label: 'On possession', percentage: 5 }
      ]
    },
    {
      name: 'Possession Linked Plan',
      description: 'Half up front, the balance on possession.',
      isDefault: false,
      items: [
        { label: 'On booking', percentage: 10, dueOffsetDays: 0 },
        { label: 'Within 45 days', percentage: 40, dueOffsetDays: 45 },
        { label: 'On possession', percentage: 50 }
      ]
    }
  ];

  /** Seeds the standard plans the first time a tenant looks at this screen. */
  private async ensureDefaults(tenantId: string) {
    const [existing] = await this.db
      .select({ id: paymentPlanTemplates.id })
      .from(paymentPlanTemplates)
      .where(eq(paymentPlanTemplates.tenantId, tenantId))
      .limit(1);

    if (existing) return;

    const now = new Date();
    for (const template of PaymentPlansService.DEFAULT_TEMPLATES) {
      const templateId = randomUUID();
      try {
        await this.db.transaction(async (tx) => {
          await tx.insert(paymentPlanTemplates).values({
            id: templateId,
            tenantId,
            entityId: null,
            name: template.name,
            description: template.description,
            isActive: true,
            isDefault: template.isDefault,
            createdAt: now,
            updatedAt: now
          });

          await tx.insert(paymentPlanTemplateItems).values(
            template.items.map((item, idx) => ({
              id: randomUUID(),
              tenantId,
              templateId,
              label: item.label,
              percentage: String(item.percentage),
              fixedAmount: null,
              dueOffsetDays: (item as { dueOffsetDays?: number }).dueOffsetDays ?? null,
              sortOrder: idx
            }))
          );
        });
      } catch {
        // A concurrent first request may have seeded it already; the unique
        // index on (tenant, entity, name) is what makes that safe to ignore.
      }
    }
  }

  /**
   * Templates usable for a project: its own, plus tenant-wide defaults.
   * Called with no `entityId` it returns every template.
   */
  async list(tenantId: string, entityId?: string) {
    await this.ensureDefaults(tenantId);

    const scope = entityId
      ? and(
          eq(paymentPlanTemplates.tenantId, tenantId),
          or(eq(paymentPlanTemplates.entityId, entityId), isNull(paymentPlanTemplates.entityId))
        )
      : eq(paymentPlanTemplates.tenantId, tenantId);

    const templates = await this.db
      .select()
      .from(paymentPlanTemplates)
      .where(scope)
      .orderBy(asc(paymentPlanTemplates.name));

    if (!templates.length) return [];

    const items = await this.db
      .select()
      .from(paymentPlanTemplateItems)
      .where(eq(paymentPlanTemplateItems.tenantId, tenantId))
      .orderBy(asc(paymentPlanTemplateItems.sortOrder));

    return templates.map((template) => ({
      ...template,
      items: items.filter((item) => item.templateId === template.id)
    }));
  }

  async get(tenantId: string, templateId: string) {
    const [template] = await this.db
      .select()
      .from(paymentPlanTemplates)
      .where(and(eq(paymentPlanTemplates.tenantId, tenantId), eq(paymentPlanTemplates.id, templateId)))
      .limit(1);

    if (!template) throw new NotFoundException('Payment plan template not found');

    const items = await this.db
      .select()
      .from(paymentPlanTemplateItems)
      .where(
        and(
          eq(paymentPlanTemplateItems.tenantId, tenantId),
          eq(paymentPlanTemplateItems.templateId, templateId)
        )
      )
      .orderBy(asc(paymentPlanTemplateItems.sortOrder));

    return { ...template, items };
  }

  /**
   * Percentage-based instalments must sum to 100.
   *
   * A plan that sums to 97% silently under-bills every customer it is applied
   * to, and nobody notices until possession.
   */
  private assertPercentagesBalance(items: CreatePaymentPlanDto['items']) {
    const percentageItems = items.filter((item) => item.percentage != null);
    if (!percentageItems.length) return;

    const total = percentageItems.reduce((sum, item) => sum + Number(item.percentage ?? 0), 0);
    // Tolerance covers thirds (33.33 × 3 = 99.99).
    if (Math.abs(total - 100) > 0.05) {
      throw new BadRequestException(
        `Payment plan instalments must total 100% — these add up to ${total.toFixed(2)}%.`
      );
    }
  }

  async create(tenantId: string, dto: CreatePaymentPlanDto) {
    this.assertPercentagesBalance(dto.items);

    const id = randomUUID();
    const now = new Date();

    await this.db.transaction(async (tx) => {
      if (dto.isDefault) await this.clearExistingDefault(tx as any, tenantId, dto.entityId ?? null);

      await tx.insert(paymentPlanTemplates).values({
        id,
        tenantId,
        entityId: dto.entityId ?? null,
        name: dto.name,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
        isDefault: dto.isDefault ?? false,
        createdAt: now,
        updatedAt: now
      });

      await tx.insert(paymentPlanTemplateItems).values(
        dto.items.map((item, idx) => ({
          id: randomUUID(),
          tenantId,
          templateId: id,
          label: item.label,
          percentage: item.percentage != null ? String(item.percentage) : null,
          fixedAmount: item.fixedAmount != null ? String(item.fixedAmount) : null,
          dueOffsetDays: item.dueOffsetDays ?? null,
          sortOrder: item.sortOrder ?? idx
        }))
      );
    });

    return this.get(tenantId, id);
  }

  async update(tenantId: string, templateId: string, dto: UpdatePaymentPlanDto) {
    await this.get(tenantId, templateId);
    if (dto.items) this.assertPercentagesBalance(dto.items);

    await this.db.transaction(async (tx) => {
      if (dto.isDefault) {
        await this.clearExistingDefault(tx as any, tenantId, dto.entityId ?? null, templateId);
      }

      await tx
        .update(paymentPlanTemplates)
        .set({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
          updatedAt: new Date()
        })
        .where(
          and(eq(paymentPlanTemplates.tenantId, tenantId), eq(paymentPlanTemplates.id, templateId))
        );

      // Instalments are replaced wholesale — editing them in place invites
      // partial updates that no longer sum to 100%.
      if (dto.items) {
        await tx
          .delete(paymentPlanTemplateItems)
          .where(
            and(
              eq(paymentPlanTemplateItems.tenantId, tenantId),
              eq(paymentPlanTemplateItems.templateId, templateId)
            )
          );

        await tx.insert(paymentPlanTemplateItems).values(
          dto.items.map((item, idx) => ({
            id: randomUUID(),
            tenantId,
            templateId,
            label: item.label,
            percentage: item.percentage != null ? String(item.percentage) : null,
            fixedAmount: item.fixedAmount != null ? String(item.fixedAmount) : null,
            dueOffsetDays: item.dueOffsetDays ?? null,
            sortOrder: item.sortOrder ?? idx
          }))
        );
      }
    });

    return this.get(tenantId, templateId);
  }

  async remove(tenantId: string, templateId: string) {
    await this.get(tenantId, templateId);
    // Items cascade. Bookings already created keep their generated milestones,
    // which are copies rather than references.
    await this.db
      .delete(paymentPlanTemplates)
      .where(
        and(eq(paymentPlanTemplates.tenantId, tenantId), eq(paymentPlanTemplates.id, templateId))
      );
    return { success: true };
  }

  /** Only one default per scope, so applying "the default" is unambiguous. */
  private async clearExistingDefault(
    tx: DrizzleDatabase,
    tenantId: string,
    entityId: string | null,
    exceptId?: string
  ) {
    const rows = await tx
      .select({ id: paymentPlanTemplates.id })
      .from(paymentPlanTemplates)
      .where(
        and(
          eq(paymentPlanTemplates.tenantId, tenantId),
          entityId ? eq(paymentPlanTemplates.entityId, entityId) : isNull(paymentPlanTemplates.entityId),
          eq(paymentPlanTemplates.isDefault, true)
        )
      );

    for (const row of rows) {
      if (row.id === exceptId) continue;
      await tx
        .update(paymentPlanTemplates)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(paymentPlanTemplates.id, row.id));
    }
  }
}
