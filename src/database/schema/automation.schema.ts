import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  varchar
} from 'drizzle-orm/pg-core';

export const automationTriggerEventEnum = pgEnum('automation_trigger_event', [
  'lead_created',
  'lead_status_changed',
  'no_contact_for_days',
  'site_visit_scheduled',
  'site_visit_done',
  'site_visit_no_show',
  'booking_created',
  'payment_received',
  'task_overdue'
]);

export const automationLogStatusEnum = pgEnum('automation_log_status', [
  'success',
  'failed',
  'skipped'
]);

export const automationRules = pgTable(
  'automation_rules',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 1000 }),
    triggerEvent: automationTriggerEventEnum('trigger_event').notNull(),
    conditions: jsonb('conditions'),
    actions: jsonb('actions').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    triggerDelayHours: integer('trigger_delay_hours').default(0),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    createdByUserId: varchar('created_by_user_id', { length: 36 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('automation_rules_tenant_idx').on(table.tenantId),
    tenantEventIdx: index('automation_rules_tenant_event_idx').on(table.tenantId, table.triggerEvent)
  })
);

export const automationLogs = pgTable(
  'automation_logs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    ruleId: varchar('rule_id', { length: 36 }).notNull(),
    leadId: varchar('lead_id', { length: 36 }),
    triggerEvent: varchar('trigger_event', { length: 100 }),
    status: automationLogStatusEnum('status').notNull(),
    errorMessage: varchar('error_message', { length: 2000 }),
    actionsExecuted: jsonb('actions_executed'),
    executedAt: timestamp('executed_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('automation_logs_tenant_idx').on(table.tenantId),
    ruleIdx: index('automation_logs_rule_idx').on(table.ruleId),
    leadIdx: index('automation_logs_lead_idx').on(table.leadId)
  })
);
