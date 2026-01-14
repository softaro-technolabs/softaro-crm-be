import { boolean, index, pgEnum, pgTable, timestamp, varchar, jsonb } from 'drizzle-orm/pg-core';

export const leadTaskStatusEnum = pgEnum('lead_task_status', ['open', 'in_progress', 'done', 'cancelled']);
export const leadTaskPriorityEnum = pgEnum('lead_task_priority', ['low', 'medium', 'high', 'urgent']);

export const leadTasks = pgTable(
  'lead_tasks',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    leadId: varchar('lead_id', { length: 36 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: varchar('description', { length: 2000 }),
    status: leadTaskStatusEnum('status').default('open').notNull(),
    priority: leadTaskPriorityEnum('priority').default('medium').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    reminderAt: timestamp('reminder_at', { withTimezone: true }),
    isArchived: boolean('is_archived').default(false).notNull(),
    metadata: jsonb('metadata'),
    assignedToUserId: varchar('assigned_to_user_id', { length: 36 }),
    createdByUserId: varchar('created_by_user_id', { length: 36 }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantLeadIdx: index('lead_tasks_tenant_lead_idx').on(table.tenantId, table.leadId),
    tenantAssignedIdx: index('lead_tasks_tenant_assigned_idx').on(table.tenantId, table.assignedToUserId, table.status),
    tenantDueIdx: index('lead_tasks_tenant_due_idx').on(table.tenantId, table.status, table.dueAt),
    leadIdx: index('lead_tasks_lead_idx').on(table.leadId)
  })
);


