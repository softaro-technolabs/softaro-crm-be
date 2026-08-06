import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, sql, max } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDatabase } from '../database/database.types';
import { tenants, leads } from '../database/schema';
import { LeadsService } from '../leads/leads.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationGateway } from '../notifications/notification.gateway';
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
    private readonly notificationGateway: NotificationGateway,
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
    rawHeaders?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { recipient, sender, bodyPlain, bodyHtml, rawHeaders } = payload;

    // When Gmail forwards an email the body/plain can be empty because the
    // original content is wrapped as an RFC822 attachment. In that case, try
    // to pull text from the HTML or from the raw charsets/content block.
    const effectivePlain = bodyPlain?.trim()
      || this.extractForwardedBody(bodyHtml ?? '', rawHeaders ?? '')
      || '';

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

    // ── Gmail forwarding verification email detection ──────────────────────
    const gmailVerification = this.extractGmailVerification(sender, payload.subject ?? '', effectivePlain, bodyHtml ?? '');
    if (gmailVerification) {
      const code = gmailVerification.confirmationCode;
      const link = gmailVerification.confirmationLink;
      this.logger.log(`[Webhook] Gmail verification detected for tenant ${tenantSlug} — code: ${code || '(none)'} link: ${link || '(none)'}`);
      this.notificationGateway.sendNotificationToTenant(tenant.id, 'gmail_verification', {
        type: 'gmail_forwarding_verification',
        confirmationCode: code,
        confirmationLink: link,
        forwardingEmail: recipient,
        message: code
          ? `Gmail forwarding verification received. Use code: ${code}`
          : 'Gmail forwarding verification received. Click the link to confirm.',
      });
      return { success: true, message: code ? `Gmail verification code: ${code}` : 'Gmail verification link sent to frontend' };
    }

    const parsed = parsePortalEmail(sender, effectivePlain, bodyHtml);

    if (!parsed) {
      this.logger.warn(`[Webhook] Could not parse email from ${sender} | subject: "${payload.subject}" | bodyLen: ${effectivePlain.length}`);
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

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * When Gmail (or another service) forwards an email, the original body is
   * sometimes wrapped as an RFC822 attachment — leaving text/plain empty.
   * This method tries to recover usable text from the HTML body or raw headers.
   */
  private extractForwardedBody(html: string, _headers: string): string {
    if (!html) return '';

    // Strip HTML tags and decode entities to get readable plain text
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|tr|td|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Detect Gmail forwarding verification emails and extract the
   * confirmation code + link so the frontend can show them in a popup.
   */
  private extractGmailVerification(
    sender: string,
    subject: string,
    bodyPlain: string,
    bodyHtml: string,
  ): { confirmationCode: string; confirmationLink: string | null } | null {
    const s = sender.toLowerCase();
    const sub = subject.toLowerCase();

    const isGmailVerification =
      (s.includes('forwarding-noreply@google.com') || s.includes('noreply@google.com')) &&
      (sub.includes('forwarding') || sub.includes('confirmation') || sub.includes('verify'));

    if (!isGmailVerification) return null;

    const text = bodyPlain || this.extractForwardedBody(bodyHtml, '');
    const htmlText = this.extractForwardedBody(bodyHtml, '');
    const combined = `${text}\n${htmlText}`;

    this.logger.log(`[Webhook] Gmail verification email detected. Body preview: ${combined.substring(0, 500)}`);

    // Gmail confirmation code — try multiple patterns
    const codeMatch =
      combined.match(/(?:confirmation|verification)\s*(?:code|#)\s*[:=\s]\s*(\d{6,10})/i)
      ?? combined.match(/(?:code|#)\s*[:=\s]\s*(\d{6,10})/i)
      ?? combined.match(/\b(\d{9})\b/)
      ?? combined.match(/\b(\d{8})\b/)
      ?? combined.match(/\b(\d{10})\b/);

    // Extract confirmation link from HTML
    const linkMatch =
      bodyHtml.match(/href=["'](https?:\/\/[^"']*(?:confirm|verify|forwarding)[^"']*)["']/i)
      ?? combined.match(/(https?:\/\/mail\.google\.com\/mail\/\S+)/i)
      ?? combined.match(/(https?:\/\/[^\s<>"']*(?:confirm|verify|forwarding)[^\s<>"']*)/i);
    const confirmationLink = linkMatch?.[1] ?? null;

    const confirmationCode = codeMatch?.[1] ?? '';

    // If we found neither code nor link, still broadcast the raw body
    if (!confirmationCode && !confirmationLink) {
      this.logger.warn(`[Webhook] Gmail verification detected but no code/link extracted. Full body: ${combined.substring(0, 1000)}`);
      return {
        confirmationCode: '',
        confirmationLink: null,
      };
    }

    return { confirmationCode, confirmationLink };
  }
}
