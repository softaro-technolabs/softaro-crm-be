import { parse99AcresEmail }    from './99acres.parser';
import { parseHousingEmail }     from './housing.parser';
import { parseMagicBricksEmail } from './magicbricks.parser';
import { parseIndiaMartEmail }   from './indiamart.parser';
import { parseSulekhaEmail }     from './sulekha.parser';
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

  if (sender.includes('99acres.com') || sender.includes('nnacres')) {
    return parse99AcresEmail(body);
  }
  if (sender.includes('housing.com') || sender.includes('proptiger.com') || sender.includes('rea.com')) {
    return parseHousingEmail(body);
  }
  if (sender.includes('magicbricks.com')) {
    return parseMagicBricksEmail(body);
  }
  if (sender.includes('indiamart.com') || sender.includes('intermesh')) {
    // Dedicated parser first; 99acres key-value parser as a safety net
    const result = parseIndiaMartEmail(body) ?? parse99AcresEmail(body);
    if (result) result.leadSource = 'indiamart';
    return result;
  }
  if (sender.includes('sulekha.com')) {
    const result = parseSulekhaEmail(body) ?? parse99AcresEmail(body);
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
