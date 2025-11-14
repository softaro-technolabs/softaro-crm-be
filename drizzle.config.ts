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
    uri: databaseUrl
  };
} else {
  if (!dbHost || !dbUser || !dbPassword || !dbName) {
    throw new Error('Either DATABASE_URL or DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME must be set in environment variables');
  }
  dbCredentials = {
    host: dbHost,
    port: dbPort ? Number(dbPort) : 3306,
    user: dbUser,
    password: dbPassword,
    database: dbName
  };
}

export default defineConfig({
  driver: 'mysql2',
  schema: './src/database/schema/index.ts',
  out: './src/database/migrations',
  dbCredentials,
  verbose: true,
  strict: true
});

