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
  strict: true,
  // Only work with public schema, ignore system schemas (information_schema, pg_catalog, etc.)
  // This prevents drizzle-kit from trying to drop system tables
  schemaFilter: ['public'],
  // Explicitly filter out system tables that might be in public schema
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
    'leads',
    'lead_assignment_settings',
    'lead_assignment_agents',
    'lead_assignment_logs',
    'lead_activities',
    'lead_tasks'
  ],
});

