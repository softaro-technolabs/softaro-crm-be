import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, sql, max } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { tenants, leads } from '../database/schema';
import { LeadsService } from '../leads/leads.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { parsePortalEmail } from './parsers/parser.factory';

const PORTAL_SOURCES = [
  { id: '99acres',     name: '99acres',      domain: '99acres.com' },
  { id: 'housing_com', name: 'Housing.com',  domain: 'housing.com' },
  { id: 'magicbricks', name: 'MagicBricks',  domain: 'magicbricks.com' },
  { id: 'indiamart',   name: 'IndiaMart',    domain: 'indiamart.com' },
  { id: 'sulekha',     name: 'Sulekha',      domain: 'sulekha.com' },
] as const;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly leadsService: LeadsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly configService: ConfigService,
  ) {}

  // ── Portal Integrations Stats ──────────────────────────────────────────────

  async getPortalIntegrations(tenantId: string) {
    const domain = this.configService.get<string>('INBOUND_EMAIL_DOMAIN') ?? 'leads.estateoscrm.com';

    // Fetch tenant slug for inbound email
    const [tenant] = await this.db
      .select({ slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const inboundEmail = tenant ? `${tenant.slug}@${domain}` : null;

    // Batch count + last lead per portal source
    const stats = await this.db
      .select({
        leadSource: leads.leadSource,
        total:      sql<number>`count(*)`,
        lastLeadAt: max(leads.createdAt),
      })
      .from(leads)
      .where(
        and(
          eq(leads.tenantId, tenantId),
          sql`${leads.leadSource} IN (${sql.join(
            PORTAL_SOURCES.map(p => sql`${p.id}`),
            sql`, `
          )})`
        )
      )
      .groupBy(leads.leadSource);

    const statsMap = new Map(stats.map(s => [s.leadSource, s]));

    const portals = PORTAL_SOURCES.map(portal => {
      const s = statsMap.get(portal.id);
      return {
        id:          portal.id,
        name:        portal.name,
        domain:      portal.domain,
        connected:   !!s && Number(s.total) > 0,
        totalLeads:  s ? Number(s.total) : 0,
        lastLeadAt:  s?.lastLeadAt ?? null,
      };
    });

    return { inboundEmail, domain, portals };
  }

  // ── Inbound Email Handler ──────────────────────────────────────────────────

  async handleInboundEmail(payload: {
    recipient: string;
    sender: string;
    subject?: string;
    bodyPlain?: string;
    bodyHtml?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { recipient, sender, bodyPlain, bodyHtml } = payload;

    // Resolve tenant from recipient address: {tenant-slug}@leads.yourdomain.com
    const tenantSlug = recipient.split('@')[0]?.toLowerCase();
    if (!tenantSlug) {
      this.logger.warn(`[Webhook] Could not extract tenant slug from recipient: ${recipient}`);
      return { success: false, message: 'Invalid recipient' };
    }

    const [tenant] = await this.db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, tenantSlug))
      .limit(1);

    if (!tenant) {
      this.logger.warn(`[Webhook] No tenant found for slug: ${tenantSlug}`);
      return { success: false, message: `Tenant not found: ${tenantSlug}` };
    }

    if (tenant.status !== 'active') {
      this.logger.warn(`[Webhook] Tenant ${tenantSlug} is not active`);
      return { success: false, message: 'Tenant inactive' };
    }

    const parsed = parsePortalEmail(sender, bodyPlain ?? '', bodyHtml);

    if (!parsed) {
      this.logger.warn(`[Webhook] Could not parse email from ${sender} for tenant ${tenantSlug}`);
      // TEMP: log body so we can capture verification emails (e.g. Gmail forwarding code)
      this.logger.warn(`[Webhook] BODY_PLAIN: ${(bodyPlain ?? '').substring(0, 1000)}`);
      await this.auditLogsService.log(
        tenant.id, 'webhook.email_parse_failed', 'webhook', null,
        { sender, subject: payload.subject, tenantSlug }, 'system',
      );
      return { success: false, message: `Unknown portal or unparseable email from ${sender}` };
    }

    this.logger.log(`[Webhook] Parsed lead "${parsed.name}" from ${parsed.leadSource} for tenant ${tenantSlug}`);

    try {
      await this.leadsService.createLead(
        tenant.id,
        {
          name:               parsed.name,
          phone:              parsed.phone,
          email:              parsed.email,
          budget:             parsed.budget,
          requirementType:    parsed.requirementType ?? 'buy',
          propertyType:       parsed.propertyType ?? undefined,
          bhkType:            parsed.bhkType ?? undefined,
          locationPreference: parsed.locationPreference ?? undefined,
          notes:              parsed.notes ?? undefined,
          leadSource:         parsed.leadSource,
          captureChannel:     `email_${parsed.leadSource}`,
          autoAssign:         true,
          metadata: {
            portalSource:  parsed.leadSource,
            emailSender:   sender,
            emailSubject:  payload.subject ?? '',
            rawPortalData: parsed.rawMetadata ?? {},
          },
        },
        { createdByUserId: null },
      );

      return { success: true, message: `Lead created for ${parsed.name} from ${parsed.leadSource}` };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[Webhook] Failed to create lead: ${msg}`);
      return { success: false, message: msg };
    }
  }
}
