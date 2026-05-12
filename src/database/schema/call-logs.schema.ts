import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar
} from 'drizzle-orm/pg-core';
import { leads } from './leads.schema';

export const callDirectionEnum = pgEnum('call_direction', ['inbound', 'outbound']);

export const callStatusEnum = pgEnum('call_status', [
  'completed',
  'missed',
  'no_answer',
  'busy',
  'failed'
]);

export const callLogs = pgTable(
  'call_logs',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    tenantId: varchar('tenant_id', { length: 36 }).notNull(),
    leadId: varchar('lead_id', { length: 36 }).references(() => leads.id, { onDelete: 'set null' }),
    agentUserId: varchar('agent_user_id', { length: 36 }),
    direction: callDirectionEnum('direction').notNull(),
    status: callStatusEnum('status').notNull(),
    callSid: varchar('call_sid', { length: 120 }),
    providerName: varchar('provider_name', { length: 50 }),
    fromNumber: varchar('from_number', { length: 50 }).notNull(),
    toNumber: varchar('to_number', { length: 50 }).notNull(),
    duration: integer('duration'),
    recordingUrl: text('recording_url'),
    notes: text('notes'),
    metadata: jsonb('metadata'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    tenantIdx: index('call_logs_tenant_idx').on(table.tenantId),
    leadIdx: index('call_logs_lead_idx').on(table.leadId),
    agentIdx: index('call_logs_agent_idx').on(table.agentUserId),
    tenantCreatedIdx: index('call_logs_tenant_created_idx').on(table.tenantId, table.createdAt)
  })
);
