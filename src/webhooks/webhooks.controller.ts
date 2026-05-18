import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  HttpCode,
  Logger,
  BadRequestException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import { WebhooksService } from './webhooks.service';
import type { Request } from 'express';

@ApiTags('Webhooks')
@Controller()
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService,
  ) {}

  // ── Authenticated: Portal Integration Stats ───────────────────────────────

  @Get('tenants/:tenantId/portal-integrations')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get portal integration stats + inbound email for a tenant' })
  async getPortalIntegrations(@Param('tenantId') tenantId: string) {
    const data = await this.webhooksService.getPortalIntegrations(tenantId);
    return { data };
  }

  // ── Public: Inbound Email Webhook (SendGrid / Mailgun) ────────────────────

  /**
   * SendGrid Inbound Parse sends multipart/form-data with these fields:
   *   to         – recipient email  (e.g. slug@leads.estateoscrm.com)
   *   from       – sender email     (e.g. noreply@99acres.com)
   *   subject    – email subject
   *   text       – plain text body
   *   html       – HTML body
   *   envelope   – JSON string: {"to":["slug@leads.estateoscrm.com"],"from":"noreply@99acres.com"}
   *
   * Mailgun Inbound Parse sends application/x-www-form-urlencoded with:
   *   recipient  – recipient email
   *   sender     – sender email
   *   body-plain – plain text body
   *   body-html  – HTML body
   *
   * We handle both via AnyFilesInterceptor (multer) which parses multipart,
   * and fall back to @Body() for url-encoded.
   */
  @Post('webhooks/inbound-email')
  @SkipThrottle()
  @HttpCode(200)
  @UseInterceptors(AnyFilesInterceptor())   // parses multipart/form-data (SendGrid)
  @ApiConsumes('multipart/form-data', 'application/x-www-form-urlencoded')
  @ApiOperation({ summary: 'Inbound email webhook — SendGrid & Mailgun supported' })
  async handleInboundEmail(@Req() req: Request) {
    const body = (req.body ?? {}) as Record<string, string>;

    // ── Extract envelope (SendGrid sends recipient/sender inside JSON field) ──
    let envelopeTo: string | undefined;
    let envelopeFrom: string | undefined;
    if (body.envelope) {
      try {
        const env = JSON.parse(body.envelope) as { to?: string[]; from?: string };
        envelopeTo   = env.to?.[0];
        envelopeFrom = env.from ?? undefined;
      } catch { /* ignore parse errors */ }
    }

    // ── Field resolution (SendGrid → Mailgun → raw fallback) ─────────────────
    const recipient = envelopeTo
      ?? body['recipient'] ?? body['to']   ?? body['To']   ?? '';

    const rawSender = envelopeFrom
      ?? body['sender']    ?? body['from'] ?? body['From'] ?? '';

    const subject   = body['subject']    ?? body['Subject']       ?? '';
    const bodyPlain = body['text']       ?? body['body-plain']    ?? body['stripped-text'] ?? '';
    const bodyHtml  = body['html']       ?? body['body-html']     ?? body['stripped-html'] ?? '';
    const rawHeaders = body['headers']   ?? '';

    if (!recipient || !rawSender) {
      this.logger.warn(`[Webhook] Missing recipient or sender — body keys: ${Object.keys(body).join(', ')}`);
      return { success: false, message: 'Missing recipient or sender' };
    }

    // ── Resolve effective sender ──────────────────────────────────────────────
    // When Gmail forwards an email it rewrites the SMTP envelope sender to
    // something like: satweek+caf_=slug=leads.domain.com@gmail.com
    // The ORIGINAL sender (e.g. nnacres-services@99acres.com) is preserved
    // inside the raw email headers as "X-Forwarded-To" / "From" / "X-Original-From".
    const sender = resolveOriginalSender(rawSender, rawHeaders, subject);

    this.logger.log(`[Webhook] Inbound email: ${rawSender} → ${recipient} (resolved sender: ${sender})`);

    return this.webhooksService.handleInboundEmail({
      recipient,
      sender,
      subject,
      bodyPlain,
      bodyHtml,
      rawHeaders,
    });
  }

  // ── Dev-only: Simulate a portal lead ─────────────────────────────────────

  @Post('webhooks/test-lead')
  @SkipThrottle()
  @HttpCode(200)
  @ApiOperation({ summary: 'Simulate a portal lead for testing (non-production only)' })
  async testLead(@Body() body: {
    tenantSlug:  string;
    portal:      '99acres' | 'housing_com' | 'magicbricks' | 'indiamart' | 'sulekha';
    name:        string;
    phone?:      string;
    email?:      string;
    budget?:     string;
    location?:   string;
    bhk?:        string;
    message?:    string;
  }) {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new BadRequestException('Test endpoint not available in production');
    }

    const domain = this.configService.get<string>('INBOUND_EMAIL_DOMAIN') ?? 'leads.estateoscrm.com';

    const senderMap: Record<string, string> = {
      '99acres':     'noreply@99acres.com',
      'housing_com': 'no-reply@housing.com',
      'magicbricks': 'noreply@magicbricks.com',
      'indiamart':   'noreply@indiamart.com',
      'sulekha':     'noreply@sulekha.com',
    };

    return this.webhooksService.handleInboundEmail({
      recipient: `${body.tenantSlug}@${domain}`,
      sender:    senderMap[body.portal] ?? 'noreply@99acres.com',
      subject:   `Test Lead from ${body.portal}`,
      bodyPlain: this.buildFakeEmail(body),
    });
  }

  // ── Helper ────────────────────────────────────────────────────────────────

  private buildFakeEmail(body: {
    name: string; phone?: string; email?: string;
    budget?: string; location?: string; bhk?: string; message?: string;
  }): string {
    return [
      `Name    : ${body.name}`,
      body.phone    && `Mobile  : ${body.phone}`,
      body.email    && `Email   : ${body.email}`,
      body.location && `City    : ${body.location}`,
      body.bhk      && `BHK     : ${body.bhk}`,
      body.budget   && `Budget  : ${body.budget}`,
      body.message  && `Message : ${body.message}`,
    ].filter(Boolean).join('\n');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * When Gmail (or any forwarder) rewrites the SMTP envelope sender, the original
 * portal sender is still embedded in the raw email headers.
 * This function tries to recover it so our portal parsers still work.
 *
 * Priority:
 *  1. X-Original-From header
 *  2. Reply-To header  (99acres sets this to their own address)
 *  3. "From:" line inside raw headers
 *  4. Subject-based heuristic (last resort)
 *  5. rawSender as-is
 */
function resolveOriginalSender(rawSender: string, headers: string, subject: string): string {
  // 1. X-Original-From
  const xOriginal = headers.match(/^X-Original-From:\s*.*?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/im);
  if (xOriginal?.[1]) return xOriginal[1].toLowerCase();

  // 2. Reply-To
  const replyTo = headers.match(/^Reply-To:\s*.*?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/im);
  if (replyTo?.[1]) return replyTo[1].toLowerCase();

  // 3. "From:" header line (skip if it matches the rewritten Gmail address)
  const fromHeader = headers.match(/^From:\s*.*?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/im);
  if (fromHeader?.[1] && !fromHeader[1].includes('gmail.com') && !fromHeader[1].includes('+caf_')) {
    return fromHeader[1].toLowerCase();
  }

  // 4. Subject-based heuristic for known portals
  const sub = subject.toLowerCase();
  if (sub.includes('99acres') || sub.includes('buyer response') || sub.includes('new enquiry')) {
    return 'noreply@99acres.com';
  }
  if (sub.includes('housing.com') || sub.includes('proptiger')) {
    return 'noreply@housing.com';
  }
  if (sub.includes('magicbricks')) {
    return 'noreply@magicbricks.com';
  }
  if (sub.includes('indiamart')) {
    return 'noreply@indiamart.com';
  }
  if (sub.includes('sulekha')) {
    return 'noreply@sulekha.com';
  }

  return rawSender;
}
