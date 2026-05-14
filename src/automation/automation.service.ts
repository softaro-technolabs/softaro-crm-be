import { Inject, Injectable, Logger, NotFoundException, OnModuleInit, BadRequestException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Cron } from '@nestjs/schedule';
import { and, eq, lt, sql, count, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { automationRules, automationLogs, leads, leadTasks } from '../database/schema';
import { MailService } from '../common/services/mail.service';
import { NotificationGateway } from '../notifications/notification.gateway';
import { PaginationUtil } from '../common/utils/pagination.util';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AUDIT_ACTIONS } from '../audit-logs/audit-actions.constants';
import { RequestContextService } from '../common/utils/request-context.service';
import type {
  AutomationTriggerEvent,
  AutomationCondition,
  AutomationAction,
  AutomationListQueryDto,
  AutomationLogQueryDto,
  CreateAutomationRuleDto,
  UpdateAutomationRuleDto
} from './automation.dto';

interface FireEventContext {
  leadId?: string;
  lead?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AutomationService implements OnModuleInit {
  private readonly logger = new Logger(AutomationService.name);
  private whatsappService?: any;
  private aiService?: any; // lazy-loaded to avoid circular dependency

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly mailService: MailService,
    private readonly notificationGateway: NotificationGateway,
    private readonly moduleRef: ModuleRef,
    private readonly auditLogsService: AuditLogsService,
    private readonly requestContext: RequestContextService,
  ) {}

  async onModuleInit() {
    // Lazy-load to avoid circular dependency (LeadsModule ↔ AutomationModule)
    try {
      const { WhatsappService } = await import('../whatsapp/whatsapp.service');
      this.whatsappService = this.moduleRef.get(WhatsappService, { strict: false });
    } catch {
      this.logger.warn('[AutomationEngine] WhatsappService not available — send_whatsapp actions will be skipped');
    }
    try {
      const { AiQualificationService } = await import('../leads/ai-qualification.service');
      this.aiService = this.moduleRef.get(AiQualificationService, { strict: false });
    } catch {
      this.logger.warn('[AutomationEngine] AiQualificationService not available — generate_ai_whatsapp will use fallback');
    }
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async createRule(tenantId: string, dto: CreateAutomationRuleDto, createdByUserId?: string) {
    const id = randomUUID();
    const now = new Date();

    await this.db.insert(automationRules).values({
      id,
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
      triggerEvent: dto.triggerEvent,
      conditions: dto.conditions ?? null,
      actions: dto.actions as any,
      isActive: dto.isActive ?? true,
      triggerDelayHours: dto.triggerDelayHours ?? 0,
      createdByUserId: createdByUserId ?? null,
      createdAt: now,
      updatedAt: now
    });

    const rule = await this.getRule(tenantId, id);

    this.auditLogsService.log(
      tenantId, AUDIT_ACTIONS.AUTOMATION_RULE_CREATED, 'automation_rule', id,
      { name: dto.name, triggerEvent: dto.triggerEvent },
      this.requestContext.getUserId(),
    ).catch(() => {});

    return rule;
  }

  async updateRule(tenantId: string, ruleId: string, dto: UpdateAutomationRuleDto) {
    const existing = await this.getRule(tenantId, ruleId);
    const updateData: Partial<typeof automationRules.$inferInsert> = { updatedAt: new Date() };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description ?? null;
    if (dto.triggerEvent !== undefined) updateData.triggerEvent = dto.triggerEvent;
    if (dto.conditions !== undefined) updateData.conditions = dto.conditions as any;
    if (dto.actions !== undefined) updateData.actions = dto.actions as any;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.triggerDelayHours !== undefined) updateData.triggerDelayHours = dto.triggerDelayHours;

    await this.db
      .update(automationRules)
      .set(updateData)
      .where(and(eq(automationRules.tenantId, tenantId), eq(automationRules.id, ruleId)));

    this.auditLogsService.log(
      tenantId, AUDIT_ACTIONS.AUTOMATION_RULE_UPDATED, 'automation_rule', ruleId,
      { changes: updateData },
      this.requestContext.getUserId(),
    ).catch(() => {});

    return this.getRule(tenantId, ruleId);
  }

  async deleteRule(tenantId: string, ruleId: string) {
    const rule = await this.getRule(tenantId, ruleId);
    await this.db
      .delete(automationRules)
      .where(and(eq(automationRules.tenantId, tenantId), eq(automationRules.id, ruleId)));

    this.auditLogsService.log(
      tenantId, AUDIT_ACTIONS.AUTOMATION_RULE_DELETED, 'automation_rule', ruleId,
      { name: rule.name },
      this.requestContext.getUserId(),
    ).catch(() => {});

    return { success: true };
  }

  async listRules(tenantId: string, query: AutomationListQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const filters = [eq(automationRules.tenantId, tenantId)];

    if (query.isActive !== undefined) {
      filters.push(eq(automationRules.isActive, query.isActive));
    }
    if (query.triggerEvent) {
      filters.push(eq(automationRules.triggerEvent, query.triggerEvent));
    }

    const whereClause = PaginationUtil.buildFilters(filters);

    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(automationRules)
        .where(whereClause || undefined)
        .orderBy(desc(automationRules.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(automationRules)
        .where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  async getRule(tenantId: string, ruleId: string) {
    const [rule] = await this.db
      .select()
      .from(automationRules)
      .where(and(eq(automationRules.tenantId, tenantId), eq(automationRules.id, ruleId)))
      .limit(1);

    if (!rule) throw new NotFoundException('Automation rule not found');
    return rule;
  }

  async toggleRule(tenantId: string, ruleId: string) {
    const rule = await this.getRule(tenantId, ruleId);
    await this.db
      .update(automationRules)
      .set({ isActive: !rule.isActive, updatedAt: new Date() })
      .where(and(eq(automationRules.tenantId, tenantId), eq(automationRules.id, ruleId)));
    return this.getRule(tenantId, ruleId);
  }

  async listLogs(tenantId: string, query: AutomationLogQueryDto) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;
    const offset = PaginationUtil.getOffset(page, limit);

    const filters = [eq(automationLogs.tenantId, tenantId)];
    if (query.ruleId) filters.push(eq(automationLogs.ruleId, query.ruleId));
    if (query.leadId) filters.push(eq(automationLogs.leadId, query.leadId));

    const whereClause = PaginationUtil.buildFilters(filters);

    const [rows, totalRows] = await Promise.all([
      this.db
        .select()
        .from(automationLogs)
        .where(whereClause || undefined)
        .orderBy(desc(automationLogs.executedAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(automationLogs)
        .where(whereClause || undefined)
    ]);

    const total = totalRows.length ? Number(totalRows[0].count) : 0;
    return PaginationUtil.buildPaginatedResult(rows, total, page, limit);
  }

  // ─── EVENT ENGINE ────────────────────────────────────────────────────────────

  async fireEvent(tenantId: string, event: AutomationTriggerEvent, context: FireEventContext) {
    try {
      // 1. Fetch all active rules for this tenant + event
      const rules = await this.db
        .select()
        .from(automationRules)
        .where(
          and(
            eq(automationRules.tenantId, tenantId),
            eq(automationRules.triggerEvent, event),
            eq(automationRules.isActive, true)
          )
        );

      if (rules.length === 0) return;

      // 2. Resolve lead context if leadId provided but lead data missing
      let leadData = context.lead ?? null;
      if (context.leadId && !leadData) {
        const [leadRow] = await this.db
          .select()
          .from(leads)
          .where(and(eq(leads.tenantId, tenantId), eq(leads.id, context.leadId)))
          .limit(1);
        leadData = leadRow as unknown as Record<string, unknown>;
      }

      const enrichedContext = { ...context, lead: leadData ?? undefined };

      // 3. Process each matching rule
      for (const rule of rules) {
        await this.processRule(tenantId, rule, event, enrichedContext);
      }
    } catch (err) {
      this.logger.error(`[AutomationEngine] fireEvent failed for event ${event} in tenant ${tenantId}`, err);
    }
  }

  private async processRule(
    tenantId: string,
    rule: typeof automationRules.$inferSelect,
    event: AutomationTriggerEvent,
    context: FireEventContext & { lead: Record<string, unknown> | null | undefined }
  ) {
    const conditions = (rule.conditions as AutomationCondition[] | null) ?? [];
    const actions = (rule.actions as AutomationAction[]) ?? [];

    // Check conditions
    if (conditions.length > 0 && !this.evaluateConditions(conditions, context)) {
      await this.logExecution(tenantId, rule.id, context.leadId, event, 'skipped', null, []);
      return;
    }

    // Execute actions
    const executedActions: { type: string; status: string; error?: string }[] = [];
    let hasError = false;
    let lastError: string | null = null;

    for (const action of actions) {
      try {
        await this.executeAction(tenantId, action, context);
        executedActions.push({ type: action.type, status: 'success' });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        executedActions.push({ type: action.type, status: 'failed', error: errorMsg });
        hasError = true;
        lastError = errorMsg;
        this.logger.error(`[AutomationEngine] Action ${action.type} failed for rule ${rule.id}: ${errorMsg}`);
      }
    }

    // Update lastRunAt
    await this.db
      .update(automationRules)
      .set({ lastRunAt: new Date() })
      .where(eq(automationRules.id, rule.id));

    await this.logExecution(
      tenantId,
      rule.id,
      context.leadId,
      event,
      hasError ? 'failed' : 'success',
      lastError,
      executedActions
    );
  }

  private evaluateConditions(
    conditions: AutomationCondition[],
    context: FireEventContext & { lead: Record<string, unknown> | null | undefined }
  ): boolean {
    const contextFlat: Record<string, unknown> = {
      ...(context.lead ?? {}),
      ...(context.metadata ?? {})
    };

    return conditions.every((condition) => {
      const actual = contextFlat[condition.field];
      const expected = condition.value;

      switch (condition.operator) {
        case 'eq': return String(actual) === String(expected);
        case 'neq': return String(actual) !== String(expected);
        case 'contains': return String(actual ?? '').toLowerCase().includes(String(expected).toLowerCase());
        case 'gt': return Number(actual) > Number(expected);
        case 'lt': return Number(actual) < Number(expected);
        case 'gte': return Number(actual) >= Number(expected);
        case 'lte': return Number(actual) <= Number(expected);
        default: return true;
      }
    });
  }

  private replaceVariables(template: string, context: FireEventContext & { lead: Record<string, unknown> | null | undefined }): string {
    const lead = context.lead ?? {};
    return template
      .replace(/{{lead\.name}}/g, String(lead.name ?? ''))
      .replace(/{{lead\.phone}}/g, String(lead.phone ?? ''))
      .replace(/{{lead\.email}}/g, String(lead.email ?? ''))
      .replace(/{{lead\.id}}/g, String(lead.id ?? ''));
  }

  private async executeAction(
    tenantId: string,
    action: AutomationAction,
    context: FireEventContext & { lead: Record<string, unknown> | null | undefined }
  ) {
    const config = action.config;

    switch (action.type) {
      case 'send_whatsapp': {
        if (!this.whatsappService) throw new BadRequestException('WhatsApp service not available');
        const phone = String(context.lead?.phone ?? config.phone ?? '');
        const message = this.replaceVariables(String(config.message ?? ''), context);
        if (!phone) throw new BadRequestException('No phone number available for send_whatsapp action');
        await this.whatsappService.sendMessage(
          tenantId,
          context.leadId ?? null,
          phone,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone,
            type: 'text',
            text: { body: message }
          },
          false,
          false
        );

        if (context.leadId) {
          await this.db.update(leads)
            .set({ lastContactedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(leads.tenantId, tenantId), eq(leads.id, context.leadId)));
        }
        break;
      }

      case 'send_email': {
        let toEmail: string;
        if (config.to === 'assignee') {
          const assignedUserId = String(context.lead?.assignedToUserId ?? '');
          if (!assignedUserId) throw new BadRequestException('No assignee found for send_email action');
          const { users } = await import('../database/schema');
          const [user] = await this.db
            .select({ email: users.email })
            .from(users)
            .where(eq(users.id, assignedUserId))
            .limit(1);
          if (!user?.email) throw new BadRequestException('Assignee email not found');
          toEmail = user.email;
        } else {
          toEmail = String(config.to ?? '');
        }
        if (!toEmail) throw new BadRequestException('No email address for send_email action');
        const subject = this.replaceVariables(String(config.subject ?? ''), context);
        const body = this.replaceVariables(String(config.body ?? ''), context);
        await this.mailService.sendEmail(toEmail, subject, body);
        break;
      }

      case 'reassign_lead': {
        if (!context.leadId) throw new BadRequestException('No leadId for reassign_lead action');
        const newUserId = String(config.userId ?? '');
        if (!newUserId) throw new BadRequestException('No userId specified in reassign_lead config');
        await this.db
          .update(leads)
          .set({ assignedToUserId: newUserId, updatedAt: new Date() })
          .where(and(eq(leads.tenantId, tenantId), eq(leads.id, context.leadId)));
        break;
      }

      case 'create_task': {
        if (!context.leadId) throw new BadRequestException('No leadId for create_task action');
        const dueInHours = Number(config.dueInHours ?? 24);
        const dueAt = new Date(Date.now() + dueInHours * 60 * 60 * 1000);
        const title = this.replaceVariables(String(config.title ?? 'Automation Task'), context);
        await this.db.insert(leadTasks).values({
          id: randomUUID(),
          tenantId,
          leadId: context.leadId,
          title,
          status: 'open',
          priority: (config.priority as any) ?? 'medium',
          dueAt,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        break;
      }

      case 'update_lead_status': {
        if (!context.leadId) throw new BadRequestException('No leadId for update_lead_status action');
        const statusId = String(config.statusId ?? '');
        if (!statusId) throw new BadRequestException('No statusId specified in update_lead_status config');
        await this.db
          .update(leads)
          .set({ statusId, updatedAt: new Date() })
          .where(and(eq(leads.tenantId, tenantId), eq(leads.id, context.leadId)));
        break;
      }

      case 'send_notification': {
        const notifEvent = String(config.event ?? 'automation_triggered');
        const payload = {
          ruleId: config.ruleId,
          message: this.replaceVariables(String(config.message ?? 'Automation triggered'), context),
          leadId: context.leadId
        };
        this.notificationGateway.sendNotificationToTenant(tenantId, notifEvent, payload);
        break;
      }

      case 'generate_ai_whatsapp': {
        // AI generates a personalised WhatsApp message using llama-3.1-8b-instant,
        // then sends it via the same WhatsApp channel — no static template needed.
        if (!this.whatsappService) throw new BadRequestException('WhatsApp service not available');
        const phone = String(context.lead?.phone ?? config.phone ?? '');
        if (!phone) throw new BadRequestException('No phone number for generate_ai_whatsapp action');

        const aiMessage = this.aiService
          ? await this.aiService.generatePersonalizedWhatsApp(
              {
                name: String(context.lead?.name ?? ''),
                phone,
                budget: context.lead?.budget ? Number(context.lead.budget) : null,
                requirementType: context.lead?.requirementType as string | null,
                propertyType: context.lead?.propertyType as string | null,
                bhkType: context.lead?.bhkType as string | null,
                aiQualification: context.lead?.aiQualification as any,
              },
              config.contextPrompt ? String(config.contextPrompt) : undefined,
            )
          : null;

        const messageText = aiMessage ?? this.replaceVariables(
          String(config.fallbackMessage ?? 'Hi {{lead.name}}, following up on your property inquiry.'),
          context,
        );

        await this.whatsappService.sendMessage(
          tenantId,
          context.leadId ?? null,
          phone,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone,
            type: 'text',
            text: { body: messageText },
          },
          false,
          false,
        );

        if (context.leadId) {
          await this.db.update(leads)
            .set({ lastContactedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(leads.tenantId, tenantId), eq(leads.id, context.leadId)));
        }
        this.logger.log(`[AutomationEngine] AI WhatsApp sent to ${phone} (leadId=${context.leadId})`);
        break;
      }

      default:
        throw new BadRequestException(`Unknown action type: ${(action as any).type}`);
    }
  }

  private async logExecution(
    tenantId: string,
    ruleId: string,
    leadId: string | undefined,
    triggerEvent: string,
    status: 'success' | 'failed' | 'skipped',
    errorMessage: string | null,
    actionsExecuted: unknown[]
  ) {
    try {
      await this.db.insert(automationLogs).values({
        id: randomUUID(),
        tenantId,
        ruleId,
        leadId: leadId ?? null,
        triggerEvent,
        status,
        errorMessage: errorMessage ?? null,
        actionsExecuted: actionsExecuted as any,
        executedAt: new Date()
      });

      // Audit log only successful triggers (not skipped/failed to avoid noise)
      if (status === 'success') {
        this.auditLogsService.log(
          tenantId, AUDIT_ACTIONS.AUTOMATION_RULE_TRIGGERED, 'automation_rule', ruleId,
          { triggerEvent, leadId, actionsCount: actionsExecuted.length },
          'system', // fired by automation engine, not a human
        ).catch(() => {});
      }
    } catch (err) {
      this.logger.error('[AutomationEngine] Failed to write execution log', err);
    }
  }

  // ─── TIME-BASED CRON ─────────────────────────────────────────────────────────

  @Cron('*/15 * * * *')
  async processTimeBasedAutomations() {
    this.logger.log('[AutomationEngine] Running time-based automation sweep...');
    try {
      await this.processNoContactRules();
      await this.processTaskOverdueRules();
    } catch (err) {
      this.logger.error('[AutomationEngine] Time-based automation failed', err);
    }
  }

  private async processNoContactRules() {
    const rules = await this.db
      .select()
      .from(automationRules)
      .where(
        and(
          eq(automationRules.triggerEvent, 'no_contact_for_days'),
          eq(automationRules.isActive, true)
        )
      );

    for (const rule of rules) {
      const delayHours = rule.triggerDelayHours ?? 0;
      if (delayHours <= 0) continue;

      const cutoff = new Date(Date.now() - delayHours * 60 * 60 * 1000);

      const staleLeads = await this.db
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.tenantId, rule.tenantId),
            lt(leads.lastContactedAt, cutoff)
          )
        )
        .limit(50);

      for (const lead of staleLeads) {
        const enrichedContext = { leadId: lead.id, lead: lead as unknown as Record<string, unknown>, metadata: {} };
        const conditions = (rule.conditions as AutomationCondition[] | null) ?? [];
        if (conditions.length > 0 && !this.evaluateConditions(conditions, enrichedContext)) continue;

        const actions = (rule.actions as AutomationAction[]) ?? [];
        const executedActions: { type: string; status: string; error?: string }[] = [];
        let hasError = false;
        let lastError: string | null = null;

        for (const action of actions) {
          try {
            await this.executeAction(rule.tenantId, action, enrichedContext);
            executedActions.push({ type: action.type, status: 'success' });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            executedActions.push({ type: action.type, status: 'failed', error: errorMsg });
            hasError = true;
            lastError = errorMsg;
          }
        }

        await this.db.update(automationRules).set({ lastRunAt: new Date() }).where(eq(automationRules.id, rule.id));
        await this.logExecution(rule.tenantId, rule.id, lead.id, 'no_contact_for_days', hasError ? 'failed' : 'success', lastError, executedActions);
      }
    }
  }

  private async processTaskOverdueRules() {
    const rules = await this.db
      .select()
      .from(automationRules)
      .where(
        and(
          eq(automationRules.triggerEvent, 'task_overdue'),
          eq(automationRules.isActive, true)
        )
      );

    if (rules.length === 0) return;

    const now = new Date();

    const overdueTasks = await this.db
      .select()
      .from(leadTasks)
      .where(
        and(
          eq(leadTasks.status, 'open'),
          lt(leadTasks.dueAt, now)
        )
      )
      .limit(100);

    for (const rule of rules) {
      for (const task of overdueTasks.filter(t => t.tenantId === rule.tenantId)) {
        const enrichedContext = {
          leadId: task.leadId ?? undefined,
          lead: null,
          metadata: { taskId: task.id, taskTitle: task.title }
        };

        const actions = (rule.actions as AutomationAction[]) ?? [];
        const executedActions: { type: string; status: string; error?: string }[] = [];
        let hasError = false;
        let lastError: string | null = null;

        for (const action of actions) {
          try {
            await this.executeAction(rule.tenantId, action, enrichedContext as any);
            executedActions.push({ type: action.type, status: 'success' });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            executedActions.push({ type: action.type, status: 'failed', error: errorMsg });
            hasError = true;
            lastError = errorMsg;
          }
        }

        await this.db.update(automationRules).set({ lastRunAt: new Date() }).where(eq(automationRules.id, rule.id));
        await this.logExecution(rule.tenantId, rule.id, task.leadId ?? undefined, 'task_overdue', hasError ? 'failed' : 'success', lastError, executedActions);
      }
    }
  }
}
