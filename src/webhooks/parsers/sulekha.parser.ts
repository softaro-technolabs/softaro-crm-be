import type { ParsedPortalLead } from './portal-lead.interface';

/**
 * Sulekha lead email parser — handles known formats:
 *
 * FORMAT A – Lead share notification ("You have a new lead from Sulekha"):
 *   Key-value block with customer details:
 *     Customer Name  : Rahul Sharma
 *     Mobile Number  : 9876543210
 *     Email          : rahul@example.com
 *     Location       : Ahmedabad
 *     Need           : 2 BHK flat for rent in Satellite
 *
 * FORMAT B – Compact digest format:
 *   "<Name> (<phone>) is looking for <requirement> in <location>"
 */

// ── Helpers ────────────────────────────────────────────────────────────────

function extractField(body: string, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const regex = new RegExp(`${key}\\s*[:\\-]\\s*(.+)`, 'im');
    const match = body.match(regex);
    if (match?.[1]) {
      const val = match[1].trim().replace(/\s+/g, ' ');
      if (val && !isEmptyValue(val)) return val;
    }
  }
  return undefined;
}

function isEmptyValue(val: string): boolean {
  const lower = val.toLowerCase().trim();
  return ['n/a', 'na', '-', 'not available', 'nil', 'none', ''].includes(lower);
}

function extractPhone(text: string): string | undefined {
  const matches = text.match(/(?:\+91[-\s]?|0)?[6-9]\d{9}/g);
  if (!matches) return undefined;
  for (const m of matches) {
    const normalized = m.replace(/[-\s+]/g, '').replace(/^91/, '');
    if (normalized.length === 10) return normalized;
  }
  return undefined;
}

function extractEmail(text: string): string | undefined {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (!matches) return undefined;
  for (const m of matches) {
    if (!/sulekha|noreply|no-reply/i.test(m)) return m;
  }
  return undefined;
}

function parseRequirement(raw?: string): 'buy' | 'rent' | 'investment' | undefined {
  if (!raw) return undefined;
  const l = raw.toLowerCase();
  if (l.includes('rent') || l.includes('lease')) return 'rent';
  if (l.includes('invest')) return 'investment';
  return 'buy';
}

function extractBhk(text: string): string | undefined {
  const bhkMatch = text.match(/(\d)\s*BHK/i);
  return bhkMatch ? `${bhkMatch[1]}BHK` : undefined;
}

// ── Main export ────────────────────────────────────────────────────────────

export function parseSulekhaEmail(body: string): ParsedPortalLead | null {
  const isSulekhaEmail =
    /new lead/i.test(body) ||
    /lead details/i.test(body) ||
    /is looking for/i.test(body) ||
    /sulekha/i.test(body);

  // FORMAT A: key-value block
  let name = extractField(body, 'Customer Name', 'Name', 'Contact Name', 'Lead Name');
  let need = extractField(body, 'Need', 'Requirement', 'Service', 'Looking For', 'Category');
  let city = extractField(body, 'Location', 'City', 'Area', 'Locality');

  // FORMAT B: "<Name> (<phone>) is looking for <requirement> in <location>"
  if (!name) {
    const compact = body.match(
      /^([A-Z][a-zA-Z .]{1,49}?)\s*(?:\([^)]*\))?\s+is looking for\s+(.+?)(?:\s+in\s+([^\n.]+))?[.\n]/im
    );
    if (compact?.[1]) {
      name = compact[1].trim();
      need = need ?? compact[2]?.trim();
      city = city ?? compact[3]?.trim();
    }
  }

  if (!name || !isSulekhaEmail) return null;

  const phone   = extractField(body, 'Mobile Number', 'Mobile', 'Phone', 'Contact No') ?? extractPhone(body);
  const email   = extractField(body, 'Email', 'Email ID', 'Email Id') ?? extractEmail(body);
  const message = extractField(body, 'Message', 'Comments', 'Additional Info', 'Description');

  const noteParts = [
    need && `Requirement: ${need}`,
    message && message !== need ? message : undefined,
  ].filter(Boolean);

  return {
    name,
    phone:              phone ? extractPhone(phone) ?? phone : undefined,
    email:              !email || isEmptyValue(email) ? undefined : email,
    requirementType:    parseRequirement(need ?? message),
    propertyType:       need,
    bhkType:            extractBhk(body),
    locationPreference: city,
    notes:              noteParts.join(' | ') || undefined,
    leadSource:         'sulekha',
    rawMetadata:        { city, need, message },
  };
}
