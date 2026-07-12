import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import { MigrationService } from './migration.service';
import { DRIZZLE } from './database.constants';
import type { DrizzleDatabase } from './database.types';
import { modules } from './schema';

interface ModuleSeed {
  slug: string;
  name: string;
  defaultRoute: string;
  sequence: number;
  /** Slug of the parent module; top-level when omitted */
  parentSlug?: string;
}

/**
 * Canonical module catalog. `sequence` drives the sidebar order in the
 * frontend (getTenantModules orders by sequence asc), so top-level modules
 * follow an agent's daily workflow: dashboard → leads → inventory → sales →
 * communication → team → admin.
 *
 * Existing rows are re-sequenced (and children re-parented) on every boot so
 * the order stays deterministic across environments; names and routes of
 * existing rows are left untouched.
 */
const MODULE_CATALOG: ModuleSeed[] = [
  // ── Top-level ──────────────────────────────────────────────────────────
  { slug: 'dashboard',  name: 'Dashboard',  defaultRoute: '/dashboard',  sequence: 1 },
  { slug: 'leads',      name: 'Leads',      defaultRoute: '/leads',      sequence: 2 },
  { slug: 'properties', name: 'Properties', defaultRoute: '/properties', sequence: 3 },
  { slug: 'quotations', name: 'Quotations', defaultRoute: '/quotations', sequence: 4 },
  { slug: 'contacts',   name: 'Contacts',   defaultRoute: '/contacts',   sequence: 5 },
  { slug: 'chat',       name: 'Chat',       defaultRoute: '/chat',       sequence: 6 },
  { slug: 'attendance', name: 'Attendance', defaultRoute: '/attendance', sequence: 7 },
  { slug: 'automation', name: 'Automation', defaultRoute: '/automation', sequence: 8 },
  { slug: 'users',      name: 'Users',      defaultRoute: '/users',      sequence: 9 },
  { slug: 'settings',   name: 'Settings',   defaultRoute: '/settings/portal-integrations', sequence: 10 },

  // ── Leads children ─────────────────────────────────────────────────────
  { slug: 'followup',     name: 'Follow-ups',          defaultRoute: '/leads/follow-ups',          sequence: 1, parentSlug: 'leads' },
  { slug: 'lead-task',    name: 'Tasks',               defaultRoute: '/lead/task',                 sequence: 2, parentSlug: 'leads' },
  { slug: 'lead-status',  name: 'Statuses',            defaultRoute: '/leads/status',              sequence: 3, parentSlug: 'leads' },
  { slug: 'lead-agent',   name: 'Agents',              defaultRoute: '/leads/agents',              sequence: 4, parentSlug: 'leads' },
  { slug: 'lead-setting', name: 'Assignment Settings', defaultRoute: '/leads/assignment/settings', sequence: 5, parentSlug: 'leads' },
  { slug: 'call-logs',    name: 'Call Logs',           defaultRoute: '/call-logs',                 sequence: 6, parentSlug: 'leads' },

  // ── Properties children ────────────────────────────────────────────────
  { slug: 'properties-units',      name: 'Units',          defaultRoute: '/properties/units',          sequence: 1, parentSlug: 'properties' },
  { slug: 'inventory-grid',        name: 'Inventory Grid', defaultRoute: '/properties/inventory-grid', sequence: 2, parentSlug: 'properties' },
  { slug: 'properties-attributes', name: 'Attributes',     defaultRoute: '/properties/attributes',     sequence: 3, parentSlug: 'properties' },

  // ── Quotations children (deals → bookings → payments follow the deal cycle) ─
  { slug: 'deals',          name: 'Deals',          defaultRoute: '/deals',       sequence: 1, parentSlug: 'quotations' },
  { slug: 'bookings',       name: 'Bookings',       defaultRoute: '/bookings',    sequence: 2, parentSlug: 'quotations' },
  { slug: 'payments',       name: 'Payments',       defaultRoute: '/payments',    sequence: 3, parentSlug: 'quotations' },
  { slug: 'commissions',    name: 'Commissions',    defaultRoute: '/commissions', sequence: 4, parentSlug: 'quotations' },
  { slug: 'document-vault', name: 'Document Vault', defaultRoute: '/documents',   sequence: 5, parentSlug: 'quotations' },

  // ── Attendance children ────────────────────────────────────────────────
  { slug: 'attendance-records',  name: 'Records',  defaultRoute: '/attendance/records',  sequence: 1, parentSlug: 'attendance' },
  { slug: 'attendance-leaves',   name: 'Leaves',   defaultRoute: '/attendance/leaves',   sequence: 2, parentSlug: 'attendance' },
  { slug: 'attendance-settings', name: 'Settings', defaultRoute: '/attendance/settings', sequence: 3, parentSlug: 'attendance' },

  // ── Users children ─────────────────────────────────────────────────────
  { slug: 'roles', name: 'Roles', defaultRoute: '/roles', sequence: 1, parentSlug: 'users' },

  // ── Settings children (portal connection first — it's the key onboarding step) ─
  { slug: 'settings-portal-integrations', name: 'Portal Integrations', defaultRoute: '/settings/portal-integrations', sequence: 1, parentSlug: 'settings' },
  { slug: 'settings-whatsapp',            name: 'WhatsApp',            defaultRoute: '/settings/whatsapp',            sequence: 2, parentSlug: 'settings' },
  { slug: 'whatsapp-templates',           name: 'WhatsApp Templates',  defaultRoute: '/settings/whatsapp/templates',  sequence: 3, parentSlug: 'settings' },
  { slug: 'settings-meta-ads',            name: 'Meta Ads',            defaultRoute: '/settings/meta-ads',            sequence: 4, parentSlug: 'settings' },
  { slug: 'settings-google-add',          name: 'Google Ads',          defaultRoute: '/settings/google-ads',          sequence: 5, parentSlug: 'settings' },
  { slug: 'settings-portal-branding',     name: 'Portal Branding',     defaultRoute: '/settings/portal-branding',     sequence: 6, parentSlug: 'settings' },
  { slug: 'audit-logs',                   name: 'Audit Logs',          defaultRoute: '/audit-logs',                   sequence: 7, parentSlug: 'settings' },
];

@Injectable()
export class DatabaseSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSyncService.name);
  private hasSynced = false;

  constructor(
    private readonly migrationService: MigrationService,
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase
  ) {}

  async onApplicationBootstrap() {
    if (this.hasSynced) {
      return;
    }

    try {
      await this.migrationService.push();
      await this.ensureModuleCatalog();
      this.hasSynced = true;
    } catch (error) {
      this.logger.error('Database sync failed', error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  private async ensureModuleCatalog() {
    const idBySlug = new Map<string, string>();

    // Pass 1: top-level modules (parents must exist before children)
    for (const seed of MODULE_CATALOG.filter((m) => !m.parentSlug)) {
      const id = await this.upsertModule(seed, null);
      idBySlug.set(seed.slug, id);
    }

    // Pass 2: children, resolved against their parent's id
    for (const seed of MODULE_CATALOG.filter((m) => m.parentSlug)) {
      const parentId = idBySlug.get(seed.parentSlug!);
      if (!parentId) {
        this.logger.warn(`Skipping module "${seed.slug}": parent "${seed.parentSlug}" not found`);
        continue;
      }
      await this.upsertModule(seed, parentId);
    }
  }

  /**
   * Insert the module if missing; otherwise repair sequence and parentId so
   * the sidebar order is deterministic. Name/route of existing rows are
   * preserved (they may have been customised).
   */
  private async upsertModule(seed: ModuleSeed, parentId: string | null): Promise<string> {
    const [existing] = await this.db
      .select({ id: modules.id, sequence: modules.sequence, parentId: modules.parentId })
      .from(modules)
      .where(eq(modules.slug, seed.slug))
      .limit(1);

    if (!existing) {
      const id = randomUUID();
      await this.db.insert(modules).values({
        id,
        slug: seed.slug,
        name: seed.name,
        defaultRoute: seed.defaultRoute,
        parentId,
        sequence: seed.sequence
      });
      this.logger.log(`Seeded module: ${seed.slug} (seq ${seed.sequence})`);
      return id;
    }

    if (existing.sequence !== seed.sequence || existing.parentId !== parentId) {
      await this.db
        .update(modules)
        .set({ sequence: seed.sequence, parentId })
        .where(eq(modules.id, existing.id));
      this.logger.log(`Re-sequenced module: ${seed.slug} (seq ${seed.sequence})`);
    }

    return existing.id;
  }
}
