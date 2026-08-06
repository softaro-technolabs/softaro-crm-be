import { index, pgEnum, pgTable, timestamp, varchar, jsonb, integer } from 'drizzle-orm/pg-core';

export const leadActivityTypeEnum = pgEnum('lead_activity_type', [
  'call',
  'whatsapp',
  'email',
  'meeting',
  'task',
  'note',
  'status_change',
  'quotation',
  'booking',
  'payment'
]);

export const sentimentEnum = pgEnum('activity_sentiment', ['positive', 'negative', 'neutral']);

export const leadActivities = pgTable(
  'lead_activities',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    leadId: varchar('lead_id', { length: 36 }).notNull(),
    type: leadActivityTypeEnum('type').notNull(),
    title: varchar('title', { length: 255 }),
    note: varchar('note', { length: 2000 }),
    durationSec: integer('duration_sec'),
    sentiment: sentimentEnum('sentiment'),
    metadata: jsonb('metadata'),
    happenedAt: timestamp('happened_at', { withTimezone: true }).defaultNow().notNull(),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    createdByUserId: varchar('created_by_user_id', { length: 36 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantLeadTimeIdx: index('lead_activities_tenant_lead_time_idx').on(table.tenantId, table.leadId, table.happenedAt),
    leadIdx: index('lead_activities_lead_idx').on(table.leadId),
    tenantNextFollowUpIdx: index('lead_activities_tenant_next_follow_up_idx').on(table.tenantId, table.nextFollowUpAt),
    tenantSentimentIdx: index('lead_activities_tenant_sentiment_idx').on(table.tenantId, table.sentiment)
  })
);




