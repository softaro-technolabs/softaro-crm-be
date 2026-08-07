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
   * ⚠️ DO NOT add tables to this list casually. `drizzle-kit push:pg` runs
   * automatically on every boot (MigrationService.push), so anything listed
   * here is reconciled against the schema files unattended.
   *
   * Tables deliberately NOT listed — deals, bookings, booking_milestones,
   * booking_payments, document_sequences, notifications, push_subscriptions,
   * commissions, contacts, attendance*, channel_partner* — are managed by hand
   * via SQL in drizzle/migrations/. Adding them back causes push to propose
   * destructive changes, because:
   *
   *   1. drizzle-kit 0.20 cannot express a partial index (`CREATE UNIQUE INDEX
   *      … WHERE …`), so it does not see `bookings_live_unit_uq`,
   *      `booking_payments_tenant_receipt_uq` or
   *      `booking_payments_tenant_date_idx` in the schema and issues DROP INDEX
   *      for all three. `bookings_live_unit_uq` is the constraint that prevents
   *      two buyers being sold the same unit.
   *   2. notifications and push_subscriptions declare uuid columns in the
   *      schema but hold varchar(36) in the database, so push wants to
   *      TRUNCATE both tables to change the column type.
   *
   * Before ever widening this list, run `DRIZZLE_STRICT=1 npx drizzle-kit
   * push:pg` by hand and read the whole diff.
   */
  tablesFilter: [
    'tenants',
    'users',
    'user_tenants',
    'roles',
    'permissions',
    'role_permissions',
    'modules',
    'tenant_modules',
    'lead_statuses',
    'lead_options',
    'leads',
    'lead_assignment_settings',
    'lead_assignment_agents',
    'lead_assignment_logs',
    'lead_activities',
    'lead_tasks',
    'property_entities',
    'property_units',
    'property_locations',
    'property_attributes',
    'property_attribute_values',
    'property_media',
    'property_status_logs',
    'lead_property_interests',
    'property_pricing_breakups',
    'quotations',
    'quotation_items',
    'waterpark_reviews',
    'property_entity_types',
    'whatsapp_accounts',
    'whatsapp_messages',
    'whatsapp_sessions',
    'whatsapp_message_queue',
    'whatsapp_scheduled_messages'
  ],
});

