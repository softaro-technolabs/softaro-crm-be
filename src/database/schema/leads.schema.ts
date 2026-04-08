import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const leadRequirementTypeEnum = pgEnum('lead_requirement_type', ['buy', 'rent', 'investment']);

export const leadSourceEnum = pgEnum('lead_source', ['facebook', 'google', 'referral', 'website', 'walk_in', 'other']);

export const leadAssignmentStrategyEnum = pgEnum('lead_assignment_strategy', [
  'round_robin',
  'property_category',
  'availability',
  'location'
]);

export const leadStatuses = pgTable(
  'lead_statuses',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    color: varchar('color', { length: 20 }),
    order: integer('display_order').default(0).notNull(),
    isFinal: boolean('is_final').default(false).notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantSlugUnique: uniqueIndex('lead_statuses_tenant_slug_uq').on(table.tenantId, table.slug),
    tenantOrderIdx: index('lead_statuses_tenant_order_idx').on(table.tenantId, table.order)
  })
);

export const leads = pgTable(
  'leads',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    statusId: varchar('status_id', { length: 36 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 50 }),
    email: varchar('email', { length: 255 }),
    budget: numeric('budget', { precision: 15, scale: 2 }),
    requirementType: leadRequirementTypeEnum('requirement_type').notNull(),
    propertyType: varchar('property_type', { length: 120 }),
    propertyCategory: varchar('property_category', { length: 120 }),
    bhkType: varchar('bhk_type', { length: 50 }),
    locationPreference: jsonb('location_preference'),
    propertyMatchScore: integer('property_match_score').default(0),
    leadScore: integer('lead_score').default(0).notNull(),
    leadLabel: varchar('lead_label', { length: 20 }),
    leadSource: leadSourceEnum('lead_source').default('website').notNull(),
    captureChannel: varchar('capture_channel', { length: 120 }),
    notes: varchar('notes', { length: 1000 }),
    metadata: jsonb('metadata'),
    assignedToUserId: varchar('assigned_to_user_id', { length: 36 }),
    createdByUserId: varchar('created_by_user_id', { length: 36 }),
    lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    kanbanPosition: bigint('kanban_position', { mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('leads_tenant_idx').on(table.tenantId),
    statusIdx: index('leads_status_idx').on(table.statusId),
    assignedIdx: index('leads_assigned_idx').on(table.assignedToUserId),
    tenantNextFollowUpIdx: index('leads_tenant_next_follow_up_idx').on(table.tenantId, table.nextFollowUpAt),
    tenantLastContactedIdx: index('leads_tenant_last_contacted_idx').on(table.tenantId, table.lastContactedAt)
  })
);

export const leadAssignmentSettings = pgTable(
  'lead_assignment_settings',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    autoAssignEnabled: boolean('auto_assign_enabled').default(true).notNull(),
    strategyOrder: jsonb('strategy_order')
      .notNull()
      .default(sql`'["availability","property_category","location","round_robin"]'::jsonb`),
    roundRobinPointerUserId: varchar('round_robin_pointer_user_id', { length: 36 }),
    publicApiKey: varchar('public_api_key', { length: 64 }),
    webhookSecret: varchar('webhook_secret', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantUnique: uniqueIndex('lead_assignment_settings_tenant_uq').on(table.tenantId)
  })
);

export const leadAssignmentAgents = pgTable(
  'lead_assignment_agents',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    isAvailable: boolean('is_available').default(true).notNull(),
    maxActiveLeads: integer('max_active_leads'),
    categoryPreferences: jsonb('category_preferences'),
    locationPreferences: jsonb('location_preferences'),
    propertyTypes: jsonb('property_types'),
    lastAssignedAt: timestamp('last_assigned_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('lead_assignment_agents_tenant_idx').on(table.tenantId),
    tenantUserUnique: uniqueIndex('lead_assignment_agents_tenant_user_uq').on(table.tenantId, table.userId)
  })
);

export const leadAssignmentLogs = pgTable(
  'lead_assignment_logs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    leadId: varchar('lead_id', { length: 36 }).notNull(),
    fromUserId: varchar('from_user_id', { length: 36 }),
    toUserId: varchar('to_user_id', { length: 36 }),
    strategy: leadAssignmentStrategyEnum('strategy'),
    reason: varchar('reason', { length: 255 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    leadIdx: index('lead_assignment_logs_lead_idx').on(table.leadId),
    tenantIdx: index('lead_assignment_logs_tenant_idx').on(table.tenantId)
  })
);


