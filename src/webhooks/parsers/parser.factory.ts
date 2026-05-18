import { parse99AcresEmail }    from './99acres.parser';
import { parseHousingEmail }     from './housing.parser';
import { parseMagicBricksEmail } from './magicbricks.parser';
import type { ParsedPortalLead } from './portal-lead.interface';

/**
 * Detect portal from sender address and delegate to the correct parser.
 * Returns null if the email is not from a known portal or can't be parsed.
 */
export function parsePortalEmail(
  senderEmail: string,
  bodyPlain: string,
  bodyHtml?: string,
): ParsedPortalLead | null {
  const sender = senderEmail.toLowerCase();
  // Use plain text body; fall back to HTML (strip tags) if plain is empty
  const body = bodyPlain?.trim() || stripHtml(bodyHtml ?? '');

  if (!body) return null;

  if (sender.includes('99acres.com')) {
    return parse99AcresEmail(body);
  }
  if (sender.includes('housing.com') || sender.includes('proptiger.com') || sender.includes('rea.com')) {
    return parseHousingEmail(body);
  }
  if (sender.includes('magicbricks.com')) {
    return parseMagicBricksEmail(body);
  }
  if (sender.includes('indiamart.com')) {
    // IndiaMart uses a similar key:value format — try 99acres parser as fallback
    const result = parse99AcresEmail(body);
    if (result) result.leadSource = 'indiamart';
    return result;
  }
  if (sender.includes('sulekha.com')) {
    const result = parse99AcresEmail(body);
    if (result) result.leadSource = 'sulekha';
    return result;
  }

  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
