import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;
const dbHost = process.env.DB_HOST;
const dbPort = process.env.DB_PORT;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbName = process.env.DB_NAME;

// Use DATABASE_URL if provided (backward compatibility), otherwise use separate variables
let dbCredentials;

if (databaseUrl) {
  dbCredentials = {
    connectionString: databaseUrl
  };
} else {
  if (!dbHost || !dbUser || !dbPassword || !dbName) {
    throw new Error('Either DATABASE_URL or DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME must be set in environment variables');
  }
  dbCredentials = {
    host: dbHost,
    port: dbPort ? Number(dbPort) : 5432,
    user: dbUser,
    password: dbPassword,
    database: dbName
  };
}

export default defineConfig({
  driver: 'pg',
  schema: './src/database/schema/index.ts',
  out: './src/database/migrations',
  dbCredentials,
  verbose: true,
  /**
   * IMPORTANT:
   * - drizzle-kit v0.20.x prompts for confirmation when `strict: true`
   * - Render (and other CI/PaaS) are non-interactive and will hang before the app binds to PORT
   *
   * Default to non-interactive. You can enable prompts locally by setting:
   * DRIZZLE_STRICT=1
   */
  strict: process.env.DRIZZLE_STRICT === '1',
  // Only work with public schema, ignore system schemas (information_schema, pg_catalog, etc.)
  // This prevents drizzle-kit from trying to drop system tables
  schemaFilter: ['public'],
  /**
   * Explicitly filter out system tables that might be in public schema.
   *
   * This MUST list every table declared in src/database/schema — anything
   * missing is silently invisible to `push:pg`, so schema edits to it never
   * reach the database. The previous list omitted 28 tables, including the
   * whole deals/bookings/commissions surface.
   *
   * When you add a new table, add it here. To regenerate the list:
   *   perl -0777 -ne "while(/pgTable\(\s*'([a-z_]+)'/g){print \"\$1\n\"}" \
   *     src/database/schema/*.schema.ts | sort -u
   */
  tablesFilter: [
    'attendance_check_ins',
    'attendance_locations',
    'attendance_records',
    'attendance_settings',
    'audit_logs',
    'automation_logs',
    'automation_rules',
    'booking_milestones',
    'booking_payments',
    'bookings',
    'calendar_sync_queue',
    'call_logs',
    'channel_partner_users',
    'channel_partners',
    'chat_conversations',
    'chat_members',
    'chat_message_reads',
    'chat_messages',
    'commissions',
    'contacts',
    'cp_incentives',
    'cp_lead_attributions',
    'deals',
    'document_sequences',
    'lead_activities',
    'lead_assignment_agents',
    'lead_assignment_logs',
    'lead_assignment_settings',
    'lead_options',
    'lead_property_interests',
    'lead_statuses',
    'lead_tasks',
    'leads',
    'leave_balances',
    'leave_requests',
    'location_tracking_logs',
    'master_permissions',
    'meta_ads_accounts',
    'meta_ads_leads',
    'modules',
    'notifications',
    'property_attribute_values',
    'property_attributes',
    'property_documents',
    'property_entities',
    'property_entity_types',
    'property_locations',
    'property_media',
    'property_pricing_breakups',
    'property_status_logs',
    'property_units',
    'push_subscriptions',
    'quotation_items',
    'quotations',
    'role_permissions',
    'roles',
    'site_visits',
    'tenant_modules',
    'tenants',
    'user_calendar_connections',
    'user_tenants',
    'users',
    'waterpark_reviews',
    'whatsapp_accounts',
    'whatsapp_message_queue',
    'whatsapp_messages',
    'whatsapp_scheduled_messages',
    'whatsapp_sessions',
    'whatsapp_templates'
  ],
});

