import type { ParsedPortalLead } from './portal-lead.interface';

/**
 * IndiaMart lead email parser — handles known formats:
 *
 * FORMAT A – Enquiry notification ("You have received 1 new Enquiry"):
 *   Key-value block with buyer details:
 *     Name           : Rahul Sharma
 *     Mobile         : +91-9876543210
 *     Email          : rahul@example.com
 *     City / State   : Ahmedabad, Gujarat
 *   Followed by the enquiry message / requirement text.
 *
 * FORMAT B – Buy Lead notification ("New Buylead matching your products"):
 *   Requirement-first layout; buyer identity appears as
 *   "Buyer: <name>" / "Member Since" block with contact details.
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
  // Skip IndiaMart's own notification addresses
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (!matches) return undefined;
  for (const m of matches) {
    if (!/indiamart|intermesh|noreply|no-reply/i.test(m)) return m;
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

// ── Main export ────────────────────────────────────────────────────────────

export function parseIndiaMartEmail(body: string): ParsedPortalLead | null {
  const isIndiaMartEmail =
    /new enquiry/i.test(body) ||
    /enquiry received/i.test(body) ||
    /buylead/i.test(body) ||
    /buy lead/i.test(body) ||
    /indiamart/i.test(body);

  // Name: key-value first, then "Buyer: <name>" style
  let name =
    extractField(body, 'Name', 'Buyer Name', 'Customer Name', 'Contact Person') ??
    body.match(/Buyer\s*[:\-]\s*([A-Z][^\n,]{1,49})/i)?.[1]?.trim();

  // Enquiry emails sometimes lead with "<Name> is interested in ..."
  if (!name) {
    const interestMatch = body.match(/^([A-Z][a-zA-Z .]{1,49}?)\s+is interested in/im);
    if (interestMatch?.[1]) name = interestMatch[1].trim();
  }

  if (!name || !isIndiaMartEmail) return null;

  const phone   = extractField(body, 'Mobile', 'Phone', 'Contact No', 'Mobile No', 'Contact') ?? extractPhone(body);
  const email   = extractField(body, 'Email', 'Email ID', 'Email Id') ?? extractEmail(body);
  const city    = extractField(body, 'City', 'Location', 'City/State', 'Address');
  const subject = extractField(body, 'Subject', 'Requirement', 'Enquiry For', 'Product', 'Looking For');
  const message = extractField(body, 'Message', 'Enquiry Message', 'Details', 'Description', 'Additional Details');

  const noteParts = [
    subject && `Requirement: ${subject}`,
    message && message !== subject ? message : undefined,
  ].filter(Boolean);

  return {
    name,
    phone:              phone ? extractPhone(phone) ?? phone : undefined,
    email:              !email || isEmptyValue(email) ? undefined : email,
    requirementType:    parseRequirement(subject ?? message),
    propertyType:       subject,
    locationPreference: city,
    notes:              noteParts.join(' | ') || undefined,
    leadSource:         'indiamart',
    rawMetadata:        { city, subject, message },
  };
}
