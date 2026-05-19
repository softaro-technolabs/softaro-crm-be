import type { ParsedPortalLead } from './portal-lead.interface';

/**
 * 99acres lead email parser — handles all known formats:
 *
 * FORMAT A – Buyer/Dealer Response notification (most common):
 *   "You've got a new buyer/dealer response"
 *   Buyer name appears before the "Buyer" / "Dealer" label
 *   Phone appears in +91-XXXXXXXXXX format
 *
 * FORMAT B – Key-Value format (some 99acres plans):
 *   Name    : Rahul Sharma
 *   Mobile  : 9876543210
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
  // Matches Indian numbers: +91-XXXXXXXXXX, +91 XXXXXXXXXX, 0XXXXXXXXXX, XXXXXXXXXX
  // Must start with 6-9 for mobile numbers
  const matches = text.match(/(?:\+91[-\s]?|0)?[6-9]\d{9}/g);
  if (!matches) return undefined;
  // Return first valid match, normalized
  for (const m of matches) {
    const normalized = m.replace(/[-\s+]/g, '').replace(/^91/, '');
    if (normalized.length === 10) return normalized;
  }
  return undefined;
}

function parseBudget(raw?: string): number | undefined {
  if (!raw || isEmptyValue(raw)) return undefined;
  const lower = raw.toLowerCase().replace(/[₹,\s]/g, '');
  // Handle ranges like "75 lacs - 90 lacs" → take upper bound
  const rangeMatch = lower.match(/([\d.]+)\s*(?:lacs?|l)\s*[-–to]\s*([\d.]+)\s*(?:lacs?|l)/);
  if (rangeMatch) return Math.round(parseFloat(rangeMatch[2]) * 1_00_000);
  const crRange = lower.match(/([\d.]+)\s*cr.*[-–to]\s*([\d.]+)\s*cr/);
  if (crRange) return Math.round(parseFloat(crRange[2]) * 1_00_00_000);
  // Single value
  const crMatch = lower.match(/([\d.]+)\s*cr/);
  if (crMatch) return Math.round(parseFloat(crMatch[1]) * 1_00_00_000);
  const lacMatch = lower.match(/([\d.]+)\s*(?:lacs?|l)/);
  if (lacMatch) return Math.round(parseFloat(lacMatch[1]) * 1_00_000);
  return undefined;
}

function parseRequirement(raw?: string): 'buy' | 'rent' | 'investment' | undefined {
  if (!raw) return undefined;
  const l = raw.toLowerCase();
  if (l.includes('rent') || l.includes('lease')) return 'rent';
  if (l.includes('invest')) return 'investment';
  return 'buy';
}

/**
 * Normalise body text for easier parsing:
 * collapse multiple blank lines, trim each line.
 */
function normalise(body: string): string {
  return body
    .split('\n')
    .map(l => l.trim())
    .filter((l, i, arr) => l !== '' || (i > 0 && arr[i - 1] !== ''))
    .join('\n');
}

// ── Format A: Response notification ──────────────────────────────────────

function parseBuyerResponseFormat(body: string): ParsedPortalLead | null {
  const isResponseEmail =
    /new buyer response/i.test(body) ||
    /new dealer response/i.test(body) ||
    /shown interest/i.test(body) ||
    /response details/i.test(body);

  if (!isResponseEmail) return null;

  const norm = normalise(body);
  const lines = norm.split('\n');

  // ── Name extraction (multiple strategies, first win) ──────────────────

  let name: string | undefined;

  // Strategy 1: "Hey <Agent>, <Buyer Name> has shown interest"
  const introMatch = norm.match(/Hey\s+[^,\n]+,\s+(.+?)\s+has shown interest/i);
  if (introMatch?.[1]?.trim()) {
    name = introMatch[1].trim();
  }

  // Strategy 2: Line immediately before "Buyer" or "Dealer" label
  if (!name) {
    for (let i = 1; i < lines.length; i++) {
      if (/^(Buyer|Dealer|Customer|Client)$/i.test(lines[i])) {
        const candidate = lines[i - 1].trim();
        if (isValidName(candidate)) {
          name = candidate;
          break;
        }
      }
    }
  }

  // Strategy 3: First proper-case name after "Recorded at" or "Response Details"
  if (!name) {
    let inBlock = false;
    for (const line of lines) {
      if (/Recorded at|Response Details/i.test(line)) { inBlock = true; continue; }
      if (inBlock && line && isValidName(line)) { name = line; break; }
    }
  }

  // Strategy 4: Any proper-case 2-word name in the first 20 lines
  if (!name) {
    for (const line of lines.slice(0, 20)) {
      if (isValidName(line) && line.split(/\s+/).length >= 2) {
        name = line;
        break;
      }
    }
  }

  if (!name) return null;

  // ── Phone ──────────────────────────────────────────────────────────────
  const phone = extractPhone(norm);

  // ── Location ───────────────────────────────────────────────────────────
  // "property in <Location> (ID-...)" or "property in <Location> -"
  const locationMatch = norm.match(/property in\s+([^(\n-]+?)(?:\s*[-–(]|$)/im);
  const city = locationMatch?.[1]?.trim().replace(/\s+/g, ' ');

  // ── BHK ────────────────────────────────────────────────────────────────
  const bhkMatch = norm.match(/(\d)\s*BHK/i);
  const bhk = bhkMatch ? `${bhkMatch[1]}BHK` : undefined;

  // ── Budget ─────────────────────────────────────────────────────────────
  // "searches are within 75 lacs - 90 lacs"
  const budgetMatch = norm.match(/searches are within\s+([^\n]+)/i);
  const budget = parseBudget(budgetMatch?.[1]);

  // ── Requirement type ───────────────────────────────────────────────────
  const rentMatch = /looking for.*rent|rent.*looking/i.test(norm);
  const requirementType = rentMatch ? 'rent' : 'buy';

  // ── Notes ──────────────────────────────────────────────────────────────
  const noteParts = [
    city && `Location: ${city}`,
    bhk  && `BHK: ${bhk}`,
    budget && `Budget: ${budgetMatch?.[1]?.trim()}`,
  ].filter(Boolean);

  return {
    name,
    phone,
    email:              undefined, // 99acres shows agent's email, not buyer's — skip
    budget,
    requirementType,
    bhkType:            bhk,
    locationPreference: city,
    notes:              noteParts.join(' | ') || undefined,
    leadSource:         '99acres',
    rawMetadata:        { city, bhk, budgetRaw: budgetMatch?.[1]?.trim() },
  };
}

/** A valid person name: 2–50 chars, starts with uppercase, no special chars */
function isValidName(str: string): boolean {
  if (!str || str.length < 2 || str.length > 50) return false;
  if (!/^[A-Z]/.test(str)) return false;
  // Reject lines that are clearly not names
  if (/\d{5,}/.test(str)) return false; // phone numbers
  if (/@/.test(str)) return false;       // emails
  if (/http/i.test(str)) return false;   // URLs
  if (/response|recorded|details|download|upgrade|premium|listing|property|buyer|dealer|member|since/i.test(str)) return false;
  return true;
}

// ── Format B: Key-Value format ─────────────────────────────────────────────

function parseKeyValueFormat(body: string): ParsedPortalLead | null {
  const name = extractField(body, 'Name', 'Buyer Name', 'Customer Name', 'Contact Name');
  if (!name) return null;

  const phone   = extractField(body, 'Mobile', 'Phone', 'Contact', 'Contact No', 'Mobile No');
  const email   = extractField(body, 'Email', 'Email ID', 'Email Id');
  const city    = extractField(body, 'City', 'Location', 'Area', 'Locality');
  const reqRaw  = extractField(body, 'Requirement', 'Property Type', 'Looking For', 'Purpose');
  const budget  = parseBudget(extractField(body, 'Budget', 'Budget Range', 'Price Range'));
  const message = extractField(body, 'Message', 'Comments', 'Note', 'Query', 'Description');
  const bhk     = extractField(body, 'BHK', 'Configuration', 'Property Config', 'Bedrooms');

  return {
    name,
    phone:              phone ?? extractPhone(body),
    email:              (!email || isEmptyValue(email)) ? undefined : email,
    budget,
    requirementType:    parseRequirement(reqRaw),
    propertyType:       reqRaw,
    bhkType:            bhk,
    locationPreference: city,
    notes:              message,
    leadSource:         '99acres',
    rawMetadata:        { city, reqRaw, message },
  };
}

// ── Main export ────────────────────────────────────────────────────────────

export function parse99AcresEmail(body: string): ParsedPortalLead | null {
  return parseBuyerResponseFormat(body) ?? parseKeyValueFormat(body);
}
