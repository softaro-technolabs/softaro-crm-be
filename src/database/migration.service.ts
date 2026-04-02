import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Pool } from 'pg';
import { spawn } from 'child_process';

import { POSTGRES_POOL } from './database.constants';

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(POSTGRES_POOL) private readonly pool: Pool
  ) { }

  async push() {
    const autoMigrate = this.configService.get<boolean>('features.autoMigrate', true);
    if (!autoMigrate) {
      this.logger.log('Auto migrations disabled via configuration');
      return;
    }

    // Run custom migrations first (for schema alterations that drizzle-kit might miss)
    await this.runCustomMigrations();

    const databaseUrl = this.configService.get<string>('database.url');
    const dbHost = this.configService.get<string>('database.host');
    const dbPort = this.configService.get<number>('database.port');
    const dbUser = this.configService.get<string>('database.user');
    const dbPassword = this.configService.get<string>('database.password');
    const dbName = this.configService.get<string>('database.name');

    if (!databaseUrl && (!dbHost || !dbUser || !dbPassword || !dbName)) {
      this.logger.warn('Database credentials missing, skipping migrations');
      return;
    }

    const isWindows = process.platform === 'win32';
    const command = isWindows ? 'npx' : 'npx';
    /**
     * NOTE: drizzle-kit v0.20.x (used in this repo) does not support `--force` on `push:pg`.
     * It will exit with "unknown option '--force'" and no schema changes will be applied.
     *
     * We intentionally keep this non-interactive (`stdin: ignore`, `CI=true`).
     * For non-destructive changes (like creating new tables), drizzle-kit applies changes without prompts.
     * For destructive changes, drizzle-kit will prompt; in that case, prefer running migrations manually.
     */
    const args = ['drizzle-kit', 'push:pg'];

    this.logger.log('Checking for database schema changes...');

    // Prepare environment variables for drizzle-kit
    const envVars: NodeJS.ProcessEnv = {
      ...process.env,
      // Set CI=true to make tools non-interactive
      CI: 'true'
    };

    /**
     * drizzle-kit tries to create a "drizzle-studio" folder under the user's home
     * directory (e.g. ~/Library/Application Support/drizzle-studio on macOS).
     *
     * In restricted environments (some PaaS / sandboxes), that path can be non-writable
     * which makes drizzle-kit fail and then tables don't get created.
     *
     * Fix: point HOME/XDG dirs to a writable temp location for the drizzle-kit child process.
     */
    const drizzleHome = join(tmpdir(), 'softaro-crm', 'drizzle-home');
    try {
      mkdirSync(drizzleHome, { recursive: true });
    } catch {
      // ignore - drizzle-kit will fail with a clear error if still not writable
    }
    envVars.HOME = drizzleHome;
    envVars.USERPROFILE = drizzleHome;
    envVars.XDG_DATA_HOME = drizzleHome;
    envVars.XDG_CONFIG_HOME = drizzleHome;
    envVars.XDG_CACHE_HOME = drizzleHome;
    envVars.XDG_STATE_HOME = drizzleHome;

    // If DATABASE_URL is provided, use it (backward compatibility)
    if (databaseUrl) {
      envVars.DATABASE_URL = databaseUrl;
    } else {
      // Otherwise, use separate variables
      envVars.DB_HOST = dbHost!;
      envVars.DB_PORT = String(dbPort!);
      envVars.DB_USER = dbUser!;
      envVars.DB_PASSWORD = dbPassword!;
      envVars.DB_NAME = dbName!;
    }

    await new Promise<void>((resolve, reject) => {
      // Capture output to check if there are actual changes
      let output = '';
      let errorOutput = '';

      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: envVars,
        shell: isWindows
      });

      // Track if we've seen system table warnings
      let hasSystemTableWarning = false;

      // Capture stdout
      child.stdout?.on('data', (data) => {
        const text = data.toString();
        output += text;

        // Check for system table warnings - if detected, log warning
        if (text.includes('spatial_ref_sys') ||
          text.includes('geography_columns') ||
          text.includes('geometry_columns') ||
          text.includes('pg_stat_statements') ||
          text.includes('raster_columns')) {
          hasSystemTableWarning = true;
          this.logger.warn('⚠️  System tables detected in migration plan. This should not happen.');
          this.logger.warn('Please check drizzle.config.ts - system tables should be excluded.');
        }

        // Log all output for visibility
        const lines = text.split('\n').filter((line: string) => line.trim());
        lines.forEach((line: string) => {
          if (line.trim()) {
            // Log warnings about system tables as warnings, others as info
            if (hasSystemTableWarning && line.includes('DROP TABLE')) {
              this.logger.warn(line.trim());
            } else {
              this.logger.log(line.trim());
            }
          }
        });
      });

      // Capture stderr
      child.stderr?.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        // Log warnings/errors
        if (text.includes('Warning') || text.includes('Error')) {
          this.logger.warn(text.trim());
        } else {
          this.logger.log(text.trim());
        }
      });

      child.on('exit', (code) => {
        if (code === 0) {
          // Check if there were actual changes or if schema was already in sync
          if (output.includes('No schema changes') ||
            output.includes('No changes detected') ||
            output.includes('schema is up to date')) {
            this.logger.log('✓ Database schema is already in sync, no changes needed');
          } else if (output.includes('Pushing changes') ||
            output.includes('Applied') ||
            output.includes('successfully')) {
            if (hasSystemTableWarning) {
              this.logger.warn('⚠️  Migration completed but system tables were detected. Please review drizzle.config.ts');
            } else {
              this.logger.log('✓ Database schema updated successfully');
            }
          } else {
            this.logger.log('✓ Database schema check completed');
          }
          resolve();
        } else {
          // Log warning but don't fail server startup
          // User can run migrations manually if needed
          if (errorOutput.trim().length > 0) {
            this.logger.warn(errorOutput.trim());
          }
          this.logger.warn(
            `drizzle-kit push:pg exited with code ${code}. ` +
            'Schema changes may not have been applied. Check logs above for details. ' +
            'You may need to run migrations manually or fix the schema.'
          );
          // Still resolve to allow server to start
          resolve();
        }
      });

      child.on('error', (error) => reject(error));
    });
  }

  /**
   * Run custom SQL migrations that need to be executed before drizzle-kit push
   * These handle schema alterations that drizzle-kit might not detect properly
   */
  private async runCustomMigrations() {
    try {
      this.logger.log('Running custom migrations...');

      const client = await this.pool.connect();
      try {
        // --- Permissions Refactor Cleanup (Automatic Handling) ---
        // Check if old 'permissions' table exists but 'master_permissions' does not (implies rename/refactor)
        const permissionsCheck = await client.query(`
          SELECT to_regclass('public.permissions') as old_table,
                 to_regclass('public.master_permissions') as new_table
        `);

        const oldPermissionsExists = permissionsCheck.rows[0]?.old_table !== null;
        const newPermissionsExists = permissionsCheck.rows[0]?.new_table !== null;

        if (oldPermissionsExists && !newPermissionsExists) {
          this.logger.log('Detected old "permissions" table during refactor. Dropping it to allow clean creation of "master_permissions".');
          // Drop old tables to avoid rename prompts and incompatible schema states
          await client.query(`DROP TABLE IF EXISTS "permissions" CASCADE`);
          // Also drop role_permissions to avoid inconsistencies as it depends on permissions
          await client.query(`DROP TABLE IF EXISTS "role_permissions" CASCADE`);
        } else {
          // If role_permissions exists, check if it has the new 'module_slug' column
          const rolePermsCheck = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'role_permissions' 
                AND column_name = 'module_slug'
             `);

          // If table exists but column is missing, drop it to allow recreation with not-null column
          const rolePermsTableCheck = await client.query(`SELECT to_regclass('public.role_permissions') as table_exists`);
          if (rolePermsTableCheck.rows[0]?.table_exists !== null && rolePermsCheck.rows.length === 0) {
            this.logger.log('Detected outdated "role_permissions" table (missing module_slug). Dropping to allow clean recreation.');
            await client.query(`DROP TABLE IF EXISTS "role_permissions" CASCADE`);
          }
        }
        // ---------------------------------------------------------

        // Check if leads table exists and if kanban_position is integer
        const tableCheck = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'leads' 
          AND column_name = 'kanban_position'
          AND table_schema = 'public'
        `);

        if (tableCheck.rows.length > 0) {
          const columnType = tableCheck.rows[0].data_type;
          if (columnType === 'integer') {
            this.logger.log('Altering kanban_position column from integer to bigint...');
            await client.query(`
              ALTER TABLE "leads" 
              ALTER COLUMN "kanban_position" TYPE bigint 
              USING "kanban_position"::bigint
            `);
            this.logger.log('Successfully altered kanban_position column to bigint');
          } else {
            this.logger.debug(`kanban_position column type is already ${columnType}`);
          }
        } else {
          this.logger.debug('leads table or kanban_position column does not exist yet, will be created by drizzle-kit');
        }

        // --- location_preference varchar -> jsonb Migration (New) ---
        const locationCheck = await client.query(`
          SELECT data_type 
          FROM information_schema.columns 
          WHERE table_name = 'leads' 
          AND column_name = 'location_preference'
          AND table_schema = 'public'
        `);

        if (locationCheck.rows.length > 0) {
          const columnType = locationCheck.rows[0].data_type;
          if (columnType !== 'jsonb') {
            this.logger.log('Altering leads.location_preference column from varchar to jsonb...');
            await client.query(`
              ALTER TABLE "leads" 
              ALTER COLUMN "location_preference" TYPE jsonb 
              USING jsonb_build_object('name', "location_preference")
            `);
            this.logger.log('Successfully altered leads.location_preference column to jsonb');
          }
        }

        // --- lead_assignment_agents.location_preferences varchar -> jsonb Migration ---
        const agentLocationCheck = await client.query(`
          SELECT data_type 
          FROM information_schema.columns 
          WHERE table_name = 'lead_assignment_agents' 
          AND column_name = 'location_preferences'
          AND table_schema = 'public'
        `);

        if (agentLocationCheck.rows.length > 0) {
          const columnType = agentLocationCheck.rows[0].data_type;
          if (columnType !== 'jsonb') {
            this.logger.log('Altering lead_assignment_agents.location_preferences column from varchar to jsonb...');
            await client.query(`
              ALTER TABLE "lead_assignment_agents" 
              ALTER COLUMN "location_preferences" TYPE jsonb 
              USING (
                CASE 
                  WHEN "location_preferences" IS NULL THEN '[]'::jsonb
                  ELSE jsonb_build_array(jsonb_build_object('name', "location_preferences"))
                END
              )
            `);
            this.logger.log('Successfully altered lead_assignment_agents.location_preferences column to jsonb');
          }
        }

        // Ensure lead_activities table exists (production-safe even if drizzle-kit isn't available)
        const leadActivitiesCheck = await client.query(`
          SELECT to_regclass('public.lead_activities') as regclass
        `);
        const leadActivitiesExists = leadActivitiesCheck.rows?.[0]?.regclass !== null;
        if (!leadActivitiesExists) {
          this.logger.log('Creating lead_activities table...');

          // Create enum type if it doesn't exist
          await client.query(`
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_activity_type') THEN
                CREATE TYPE "lead_activity_type" AS ENUM ('call','whatsapp','email','meeting','task','note','status_change');
              END IF;
            END $$;
          `);

          // Create table
          await client.query(`
            CREATE TABLE IF NOT EXISTS "lead_activities" (
              "id" varchar(36) PRIMARY KEY,
              "tenant_id" varchar(36) NOT NULL,
              "lead_id" varchar(36) NOT NULL,
              "type" "lead_activity_type" NOT NULL,
              "title" varchar(255),
              "note" varchar(2000),
              "metadata" jsonb,
              "happened_at" timestamptz NOT NULL DEFAULT now(),
              "next_follow_up_at" timestamptz,
              "created_by_user_id" varchar(36),
              "created_at" timestamptz NOT NULL DEFAULT now()
            );
          `);

          // Indexes
          await client.query(`
            CREATE INDEX IF NOT EXISTS "lead_activities_tenant_lead_time_idx"
            ON "lead_activities" ("tenant_id","lead_id","happened_at");
          `);
          await client.query(`
            CREATE INDEX IF NOT EXISTS "lead_activities_lead_idx"
            ON "lead_activities" ("lead_id");
          `);
          await client.query(`
            CREATE INDEX IF NOT EXISTS "lead_activities_tenant_next_follow_up_idx"
            ON "lead_activities" ("tenant_id","next_follow_up_at");
          `);

          this.logger.log('✓ lead_activities table created');
        } else {
          this.logger.debug('lead_activities table already exists');
        }

        // Ensure enum has 'task' value (safe for existing databases)
        await client.query(`
          DO $$
          BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_activity_type') THEN
              IF NOT EXISTS (
                SELECT 1
                FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'lead_activity_type' AND e.enumlabel = 'task'
              ) THEN
                ALTER TYPE "lead_activity_type" ADD VALUE 'task';
              END IF;
            END IF;
          END $$;
        `);

        // Ensure lead_tasks table exists
        const leadTasksCheck = await client.query(`
          SELECT to_regclass('public.lead_tasks') as regclass
        `);
        const leadTasksExists = leadTasksCheck.rows?.[0]?.regclass !== null;
        if (!leadTasksExists) {
          this.logger.log('Creating lead_tasks table...');

          // Enums
          await client.query(`
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_task_status') THEN
                CREATE TYPE "lead_task_status" AS ENUM ('open','in_progress','done','cancelled');
              END IF;
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_task_priority') THEN
                CREATE TYPE "lead_task_priority" AS ENUM ('low','medium','high','urgent');
              END IF;
            END $$;
          `);

          // Table
          await client.query(`
            CREATE TABLE IF NOT EXISTS "lead_tasks" (
              "id" varchar(36) PRIMARY KEY,
              "tenant_id" varchar(36) NOT NULL,
              "lead_id" varchar(36),
              "title" varchar(255) NOT NULL,
              "description" varchar(2000),
              "status" "lead_task_status" NOT NULL DEFAULT 'open',
              "priority" "lead_task_priority" NOT NULL DEFAULT 'medium',
              "due_at" timestamptz,
              "reminder_at" timestamptz,
              "is_archived" boolean NOT NULL DEFAULT false,
              "metadata" jsonb,
              "assigned_to_user_id" varchar(36),
              "created_by_user_id" varchar(36),
              "completed_at" timestamptz,
              "created_at" timestamptz NOT NULL DEFAULT now(),
              "updated_at" timestamptz NOT NULL DEFAULT now()
            );
          `);

          // Indexes
          await client.query(`
            CREATE INDEX IF NOT EXISTS "lead_tasks_tenant_lead_idx"
            ON "lead_tasks" ("tenant_id","lead_id");
          `);
          await client.query(`
            CREATE INDEX IF NOT EXISTS "lead_tasks_tenant_assigned_idx"
            ON "lead_tasks" ("tenant_id","assigned_to_user_id","status");
          `);
          await client.query(`
            CREATE INDEX IF NOT EXISTS "lead_tasks_tenant_due_idx"
            ON "lead_tasks" ("tenant_id","status","due_at");
          `);
          await client.query(`
            CREATE INDEX IF NOT EXISTS "lead_tasks_lead_idx"
            ON "lead_tasks" ("lead_id");
          `);

          this.logger.log('✓ lead_tasks table created');
        } else {
          this.logger.debug('lead_tasks table already exists');
          // Ensure lead_id is optional for existing table
          const columnCheck = await client.query(`
            SELECT is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'lead_tasks' 
            AND column_name = 'lead_id'
            AND table_schema = 'public'
          `);
          if (columnCheck.rows.length > 0 && columnCheck.rows[0].is_nullable === 'NO') {
            this.logger.log('Altering lead_tasks.lead_id to be optional...');
            await client.query(`ALTER TABLE "lead_tasks" ALTER COLUMN "lead_id" DROP NOT NULL`);
            this.logger.log('Successfully altered lead_tasks.lead_id to be optional');
          }
        }

        // ─── Chat Tables ────────────────────────────────────────────
        await this.runChatMigrations(client);
        // ─────────────────────────────────────────────────────────────

        // ─── Notifications Table ─────────────────────────────────────
        await this.runNotificationsMigrations(client);
        // ─────────────────────────────────────────────────────────────

        // ─── WhatsApp Tables ─────────────────────────────────────────
        await this.runWhatsappMigrations(client);
        // ─────────────────────────────────────────────────────────────

        // ─── Quotation Tables (New) ──────────────────────────────────
        await this.runQuotationMigrations(client);
        // ─────────────────────────────────────────────────────────────
      } finally {
        client.release();
      }
    } catch (error) {
      // Log error but don't fail - drizzle-kit will handle table creation
      this.logger.warn(
        `Custom migration error (non-critical): ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create notifications tables if they don't exist (idempotent).
   */
  private async runNotificationsMigrations(client: any) {
    const notificationsCheck = await client.query(`SELECT to_regclass('public.notifications') as t`);
    if (notificationsCheck.rows[0]?.t === null) {
      this.logger.log('Creating notifications table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "notifications" (
          "id"          varchar(36) PRIMARY KEY,
          "tenant_id"   varchar(36) NOT NULL,
          "user_id"     varchar(36) NOT NULL,
          "type"        varchar(255) NOT NULL,
          "title"       varchar(255) NOT NULL,
          "message"     text,
          "is_read"     boolean NOT NULL DEFAULT false,
          "metadata"    jsonb,
          "created_at"  timestamptz NOT NULL DEFAULT now()
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" ("user_id","tenant_id");`);
      await client.query(`CREATE INDEX IF NOT EXISTS "notifications_unread_idx" ON "notifications" ("user_id","is_read");`);
      this.logger.log('✓ notifications table created');
    } else {
      this.logger.debug('notifications table already exists');
    }

    // push_subscriptions
    const pushCheck = await client.query(`SELECT to_regclass('public.push_subscriptions') as t`);
    if (pushCheck.rows[0]?.t === null) {
      this.logger.log('Creating push_subscriptions table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "push_subscriptions" (
          "id"            varchar(36) PRIMARY KEY,
          "tenant_id"     varchar(36) NOT NULL,
          "user_id"       varchar(36) NOT NULL,
          "subscription"  jsonb NOT NULL,
          "created_at"    timestamptz NOT NULL DEFAULT now(),
          "updated_at"    timestamptz NOT NULL DEFAULT now()
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS "push_subscriptions_user_idx" ON "push_subscriptions" ("user_id","tenant_id");`);
      this.logger.log('✓ push_subscriptions table created');
    } else {
      this.logger.debug('push_subscriptions table already exists');
    }
  }

  /**
   * Create chat tables if they don't exist (idempotent).
   */
  private async runChatMigrations(client: any) {
    // Enum
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_type') THEN
          CREATE TYPE "conversation_type" AS ENUM ('direct','group');
        END IF;
      END $$;
    `);

    // chat_conversations
    const convCheck = await client.query(
      `SELECT to_regclass('public.chat_conversations') as t`
    );
    if (convCheck.rows[0]?.t === null) {
      this.logger.log('Creating chat_conversations table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "chat_conversations" (
          "id"                    varchar(36) PRIMARY KEY,
          "tenant_id"             varchar(36) NOT NULL,
          "type"                  "conversation_type" NOT NULL DEFAULT 'direct',
          "name"                  varchar(255),
          "description"           varchar(1000),
          "avatar_url"            varchar(500),
          "created_by_user_id"    varchar(36) NOT NULL,
          "last_message_at"       timestamptz,
          "last_message_preview"  varchar(255),
          "is_archived"           boolean NOT NULL DEFAULT false,
          "created_at"            timestamptz NOT NULL DEFAULT now(),
          "updated_at"            timestamptz NOT NULL DEFAULT now()
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS "chat_conversations_tenant_idx" ON "chat_conversations" ("tenant_id");`);
      await client.query(`CREATE INDEX IF NOT EXISTS "chat_conversations_tenant_last_msg_idx" ON "chat_conversations" ("tenant_id","last_message_at");`);
      this.logger.log('✓ chat_conversations table created');
    } else {
      this.logger.debug('chat_conversations table already exists');
    }

    // chat_members
    const membersCheck = await client.query(`SELECT to_regclass('public.chat_members') as t`);
    if (membersCheck.rows[0]?.t === null) {
      this.logger.log('Creating chat_members table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "chat_members" (
          "id"                varchar(36) PRIMARY KEY,
          "conversation_id"   varchar(36) NOT NULL,
          "user_id"           varchar(36) NOT NULL,
          "tenant_id"         varchar(36) NOT NULL,
          "is_admin"          boolean NOT NULL DEFAULT false,
          "joined_at"         timestamptz NOT NULL DEFAULT now(),
          "left_at"           timestamptz,
          "added_by_user_id"  varchar(36)
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS "chat_members_conv_user_idx" ON "chat_members" ("conversation_id","user_id");`);
      await client.query(`CREATE INDEX IF NOT EXISTS "chat_members_user_idx" ON "chat_members" ("user_id","tenant_id");`);
      this.logger.log('✓ chat_members table created');
    } else {
      this.logger.debug('chat_members table already exists');
    }

    // chat_messages
    const msgsCheck = await client.query(`SELECT to_regclass('public.chat_messages') as t`);
    if (msgsCheck.rows[0]?.t === null) {
      this.logger.log('Creating chat_messages table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "chat_messages" (
          "id"                    varchar(36) PRIMARY KEY,
          "conversation_id"       varchar(36) NOT NULL,
          "tenant_id"             varchar(36) NOT NULL,
          "sender_user_id"        varchar(36) NOT NULL,
          "content"               text NOT NULL,
          "reply_to_message_id"   varchar(36),
          "edited_at"             timestamptz,
          "deleted_at"            timestamptz,
          "created_at"            timestamptz NOT NULL DEFAULT now()
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS "chat_messages_conv_created_idx" ON "chat_messages" ("conversation_id","created_at");`);
      await client.query(`CREATE INDEX IF NOT EXISTS "chat_messages_tenant_conv_idx" ON "chat_messages" ("tenant_id","conversation_id");`);
      await client.query(`CREATE INDEX IF NOT EXISTS "chat_messages_sender_idx" ON "chat_messages" ("sender_user_id");`);
      this.logger.log('✓ chat_messages table created');
    } else {
      this.logger.debug('chat_messages table already exists');
    }

    // chat_message_reads
    const readsCheck = await client.query(`SELECT to_regclass('public.chat_message_reads') as t`);
    if (readsCheck.rows[0]?.t === null) {
      this.logger.log('Creating chat_message_reads table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "chat_message_reads" (
          "id"                    varchar(36) PRIMARY KEY,
          "conversation_id"       varchar(36) NOT NULL,
          "user_id"               varchar(36) NOT NULL,
          "tenant_id"             varchar(36) NOT NULL,
          "last_read_message_id"  varchar(36) NOT NULL,
          "read_at"               timestamptz NOT NULL DEFAULT now()
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS "chat_message_reads_conv_user_idx" ON "chat_message_reads" ("conversation_id","user_id");`);
      await client.query(`CREATE INDEX IF NOT EXISTS "chat_message_reads_user_tenant_idx" ON "chat_message_reads" ("user_id","tenant_id");`);
      this.logger.log('✓ chat_message_reads table created');
    } else {
      this.logger.debug('chat_message_reads table already exists');
    }
  }

  /**
   * Create WhatsApp tables if they don't exist (idempotent).
   */
  private async runWhatsappMigrations(client: any) {
    // Enums
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'whatsapp_message_direction') THEN
          CREATE TYPE "whatsapp_message_direction" AS ENUM ('inbound', 'outbound');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'whatsapp_message_status') THEN
          CREATE TYPE "whatsapp_message_status" AS ENUM ('sent', 'delivered', 'read', 'failed', 'received');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'whatsapp_scheduled_message_status') THEN
          CREATE TYPE "whatsapp_scheduled_message_status" AS ENUM ('pending', 'sent', 'cancelled', 'failed');
        END IF;
      END $$;
    `);

    // whatsapp_accounts
    const accountsCheck = await client.query('SELECT to_regclass(\'public.whatsapp_accounts\') as t');
    if (accountsCheck.rows[0]?.t === null) {
      this.logger.log('Creating whatsapp_accounts table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "whatsapp_accounts" (
          "id" varchar(36) PRIMARY KEY,
          "tenant_id" varchar(36) NOT NULL,
          "business_account_id" varchar(100) NOT NULL,
          "phone_number_id" varchar(100) NOT NULL,
          "phone_number" varchar(50) NOT NULL,
          "waba_id" varchar(100),
          "encrypted_permanent_token" text NOT NULL,
          "is_active" boolean DEFAULT true NOT NULL,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        );
      `);
      await client.query('CREATE INDEX IF NOT EXISTS "whatsapp_accounts_tenant_idx" ON "whatsapp_accounts" ("tenant_id");');
      await client.query('CREATE INDEX IF NOT EXISTS "whatsapp_accounts_phone_id_idx" ON "whatsapp_accounts" ("phone_number_id");');
      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_accounts_tenant_uq" ON "whatsapp_accounts" ("tenant_id");');
      this.logger.log('✓ whatsapp_accounts table created');
    }

    // whatsapp_messages
    const messagesCheck = await client.query('SELECT to_regclass(\'public.whatsapp_messages\') as t');
    if (messagesCheck.rows[0]?.t === null) {
      this.logger.log('Creating whatsapp_messages table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
          "id" varchar(36) PRIMARY KEY,
          "tenant_id" varchar(36) NOT NULL,
          "lead_id" varchar(36),
          "contact_phone" varchar(50) NOT NULL,
          "direction" "whatsapp_message_direction" NOT NULL,
          "message_id" varchar(100) NOT NULL,
          "status" "whatsapp_message_status" NOT NULL,
          "content" jsonb NOT NULL,
          "is_template" boolean DEFAULT false NOT NULL,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        );
      `);
      await client.query('CREATE INDEX IF NOT EXISTS "whatsapp_messages_tenant_idx" ON "whatsapp_messages" ("tenant_id");');
      await client.query('CREATE INDEX IF NOT EXISTS "whatsapp_messages_lead_idx" ON "whatsapp_messages" ("lead_id");');
      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_messages_message_id_uq" ON "whatsapp_messages" ("message_id");');
      this.logger.log('✓ whatsapp_messages table created');
    }

    // whatsapp_sessions
    const sessionsCheck = await client.query('SELECT to_regclass(\'public.whatsapp_sessions\') as t');
    if (sessionsCheck.rows[0]?.t === null) {
      this.logger.log('Creating whatsapp_sessions table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "whatsapp_sessions" (
          "id" varchar(36) PRIMARY KEY,
          "tenant_id" varchar(36) NOT NULL,
          "contact_phone" varchar(50) NOT NULL,
          "last_customer_message_at" timestamptz NOT NULL,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        );
      `);
      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_sessions_tenant_contact_uq" ON "whatsapp_sessions" ("tenant_id", "contact_phone");');
      this.logger.log('✓ whatsapp_sessions table created');
    }

    // whatsapp_message_queue
    const queueCheck = await client.query('SELECT to_regclass(\'public.whatsapp_message_queue\') as t');
    if (queueCheck.rows[0]?.t === null) {
      this.logger.log('Creating whatsapp_message_queue table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "whatsapp_message_queue" (
          "id" varchar(36) PRIMARY KEY,
          "tenant_id" varchar(36) NOT NULL,
          "lead_id" varchar(36),
          "contact_phone" varchar(50) NOT NULL,
          "payload" jsonb NOT NULL,
          "attempts" varchar(10) DEFAULT '0' NOT NULL,
          "is_processing" boolean DEFAULT false NOT NULL,
          "last_attempt_at" timestamptz,
          "next_attempt_at" timestamptz DEFAULT now() NOT NULL,
          "error_log" text,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        );
      `);
      await client.query('CREATE INDEX IF NOT EXISTS "whatsapp_message_queue_polling_idx" ON "whatsapp_message_queue" ("next_attempt_at", "is_processing");');
      this.logger.log('✓ whatsapp_message_queue table created');
    }

    // whatsapp_scheduled_messages
    const scheduledCheck = await client.query('SELECT to_regclass(\'public.whatsapp_scheduled_messages\') as t');
    if (scheduledCheck.rows[0]?.t === null) {
      this.logger.log('Creating whatsapp_scheduled_messages table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "whatsapp_scheduled_messages" (
          "id" varchar(36) PRIMARY KEY,
          "tenant_id" varchar(36) NOT NULL,
          "lead_id" varchar(36),
          "contact_phone" varchar(50) NOT NULL,
          "payload" jsonb NOT NULL,
          "scheduled_at" timestamptz NOT NULL,
          "status" "whatsapp_scheduled_message_status" DEFAULT 'pending' NOT NULL,
          "is_automated" boolean DEFAULT false NOT NULL,
          "created_at" timestamptz DEFAULT now() NOT NULL,
          "updated_at" timestamptz DEFAULT now() NOT NULL
        );
      `);
      await client.query('CREATE INDEX IF NOT EXISTS "whatsapp_scheduled_messages_tenant_idx" ON "whatsapp_scheduled_messages" ("tenant_id");');
      await client.query('CREATE INDEX IF NOT EXISTS "whatsapp_scheduled_messages_lead_idx" ON "whatsapp_scheduled_messages" ("lead_id");');
      await client.query('CREATE INDEX IF NOT EXISTS "whatsapp_scheduled_messages_scheduled_at_idx" ON "whatsapp_scheduled_messages" ("scheduled_at");');
      await client.query('CREATE INDEX IF NOT EXISTS "whatsapp_scheduled_messages_status_idx" ON "whatsapp_scheduled_messages" ("status");');
      this.logger.log('✓ whatsapp_scheduled_messages table created');
    }
  }

  /**
   * Create Quotation tables if they don't exist (idempotent).
   */
  private async runQuotationMigrations(client: any) {
    // 1. Create Enum
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quotation_status') THEN
          CREATE TYPE "quotation_status" AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted');
        END IF;
      END $$;
    `);

    // 2. Create Quotations Table
    const quotationsCheck = await client.query(`SELECT to_regclass('public.quotations') as t`);
    if (quotationsCheck.rows[0]?.t === null) {
      this.logger.log('Creating quotations table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "quotations" (
          "id"                varchar(36) PRIMARY KEY,
          "tenant_id"         varchar(36) NOT NULL,
          "lead_id"           varchar(36) NOT NULL,
          "property_unit_id"  varchar(36),
          "quotation_number"  varchar(50) NOT NULL,
          "title"             varchar(255) NOT NULL,
          "status"            "quotation_status" NOT NULL DEFAULT 'draft',
          "issue_date"        timestamptz NOT NULL DEFAULT now(),
          "expiry_date"       timestamptz,
          "currency"          varchar(10) NOT NULL DEFAULT 'INR',
          "sub_total"         numeric(15,2) NOT NULL DEFAULT 0,
          "tax_total"         numeric(15,2) NOT NULL DEFAULT 0,
          "discount_total"    numeric(15,2) NOT NULL DEFAULT 0,
          "grand_total"       numeric(15,2) NOT NULL DEFAULT 0,
          
          "project_name"      varchar(255),
          "unit_number"       varchar(50),
          "floor_tower"       varchar(100),
          "unit_type"         varchar(100),
          "carpet_area"       varchar(100),
          "super_built_up"    varchar(100),
          "possession"        varchar(100),
          "payment_plan"      varchar(255),
          
          "base_price"        numeric(15,2) DEFAULT 0,
          "plc"               numeric(15,2) DEFAULT 0,
          "parking"           numeric(15,2) DEFAULT 0,
          "club_membership"   numeric(15,2) DEFAULT 0,
          "gst_rate"          numeric(5,2) DEFAULT 5,
          "gst_amount"        numeric(15,2) DEFAULT 0,
          "stamp_duty"        numeric(15,2) DEFAULT 0,
          "discount"          numeric(15,2) DEFAULT 0,
          "other_charges"     jsonb DEFAULT '[]',
          
          "notes"             text,
          "terms"             text,
          "metadata"          jsonb,
          "created_at"        timestamptz NOT NULL DEFAULT now(),
          "updated_at"        timestamptz NOT NULL DEFAULT now()
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS "quotations_tenant_idx" ON "quotations" ("tenant_id");`);
      await client.query(`CREATE INDEX IF NOT EXISTS "quotations_lead_idx" ON "quotations" ("lead_id");`);
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "quotations_tenant_number_uq" ON "quotations" ("tenant_id", "quotation_number");`);
      this.logger.log('✓ quotations table created');
    } else {
      // Logic for adding missing columns to existing table
      const columns = [
        { name: 'property_unit_id', type: 'varchar(36)' },
        { name: 'project_name', type: 'varchar(255)' },
        { name: 'unit_number', type: 'varchar(50)' },
        { name: 'floor_tower', type: 'varchar(100)' },
        { name: 'unit_type', type: 'varchar(100)' },
        { name: 'carpet_area', type: 'varchar(100)' },
        { name: 'super_built_up', type: 'varchar(100)' },
        { name: 'possession', type: 'varchar(100)' },
        { name: 'payment_plan', type: 'varchar(255)' },
        { name: 'base_price', type: 'numeric(15,2) DEFAULT 0' },
        { name: 'plc', type: 'numeric(15,2) DEFAULT 0' },
        { name: 'parking', type: 'numeric(15,2) DEFAULT 0' },
        { name: 'club_membership', type: 'numeric(15,2) DEFAULT 0' },
        { name: 'gst_rate', type: 'numeric(5,2) DEFAULT 5' },
        { name: 'gst_amount', type: 'numeric(15,2) DEFAULT 0' },
        { name: 'stamp_duty', type: 'numeric(15,2) DEFAULT 0' },
        { name: 'discount', type: 'numeric(15,2) DEFAULT 0' },
        { name: 'other_charges', type: "jsonb DEFAULT '[]'" }
      ];

      for (const col of columns) {
        const colCheck = await client.query(`
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'quotations' AND column_name = '${col.name}'
        `);
        if (colCheck.rows.length === 0) {
          this.logger.log(`Adding missing column "${col.name}" to quotations table...`);
          await client.query(`ALTER TABLE "quotations" ADD COLUMN "${col.name}" ${col.type}`);
        }
      }
    }

    // 3. Create Quotation Items Table
    const itemsCheck = await client.query(`SELECT to_regclass('public.quotation_items') as t`);
    if (itemsCheck.rows[0]?.t === null) {
      this.logger.log('Creating quotation_items table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS "quotation_items" (
          "id"                varchar(36) PRIMARY KEY,
          "quotation_id"      varchar(36) NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
          "property_unit_id"  varchar(36),
          "description"       text NOT NULL,
          "quantity"          numeric(15,2) NOT NULL DEFAULT 1,
          "unit_price"        numeric(15,2) NOT NULL DEFAULT 0,
          "tax_rate"          numeric(5,2) NOT NULL DEFAULT 0,
          "discount_rate"     numeric(5,2) NOT NULL DEFAULT 0,
          "total"             numeric(15,2) NOT NULL DEFAULT 0,
          "display_order"     integer NOT NULL DEFAULT 0,
          "created_at"        timestamptz NOT NULL DEFAULT now(),
          "updated_at"        timestamptz NOT NULL DEFAULT now()
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS "quotation_items_quotation_idx" ON "quotation_items" ("quotation_id");`);
      this.logger.log('✓ quotation_items table created');
    }
  }
}