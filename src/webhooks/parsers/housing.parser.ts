import type { ParsedPortalLead } from './portal-lead.interface';

/**
 * Housing.com lead email parser — handles multiple formats:
 *
 * FORMAT A – Key-Value (older/some plans):
 *   Name    : Rahul Sharma
 *   Phone   : +91 9876543210
 *   Email   : rahul@example.com
 *
 * FORMAT B – Contact Request (current common format):
 *   "Vatsal Bhatti would like to talk to you"
 *   Name: Vatsal Bhatti
 *   1 BHK Apartment
 *   Gurukul
 *   ₹ 50.0 L
 */

function extractField(body: string, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const regex = new RegExp(`${key}\\s*[:\\-]\\s*(.+)`, 'im');
    const match = body.match(regex);
    if (match?.[1]) {
      const val = match[1].trim().replace(/\s+/g, ' ');
      if (val && val.toLowerCase() !== 'n/a' && val !== '-') return val;
    }
  }
  return undefined;
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

function parseBudget(raw?: string): number | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase().replace(/[₹,\s]/g, '');
  const crMatch = lower.match(/([\d.]+)\s*cr/);
  if (crMatch) return Math.round(parseFloat(crMatch[1]) * 1_00_00_000);
  const lacMatch = lower.match(/([\d.]+)\s*l/);
  if (lacMatch) return Math.round(parseFloat(lacMatch[1]) * 1_00_000);
  const plain = parseFloat(lower.replace(/[^\d.]/g, ''));
  return isNaN(plain) ? undefined : plain;
}

function parseRequirement(raw?: string): 'buy' | 'rent' | 'investment' | undefined {
  if (!raw) return undefined;
  const l = raw.toLowerCase();
  if (l.includes('rent') || l.includes('lease') || l.includes('pg')) return 'rent';
  if (l.includes('invest')) return 'investment';
  return 'buy';
}

// ── Format B: "X would like to talk to you" (current Housing.com format) ─────

function parseContactRequestFormat(body: string): ParsedPortalLead | null {
  // "Vatsal Bhatti would like to talk to you"
  const nameMatch = body.match(/([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)\s+would like to talk/i);
  if (!nameMatch?.[1]) return null;

  const name = nameMatch[1].trim();

  const phone = extractPhone(body);

  // BHK: "1 BHK Apartment" or "2 BHK Flat"
  const bhkMatch = body.match(/(\d)\s*BHK\s*(?:Apartment|Flat|House|Villa|Penthouse|Studio)?/i);
  const bhk = bhkMatch ? `${bhkMatch[1]}BHK` : undefined;

  // Budget: "₹ 50.0 L" or "₹ 1.2 Cr"
  const budgetMatch = body.match(/₹\s*([\d.]+)\s*(L|Lac|Lacs|Cr|Crore)/i);
  const budget = budgetMatch ? parseBudget(`${budgetMatch[1]} ${budgetMatch[2]}`) : undefined;
  const budgetRaw = budgetMatch ? `₹ ${budgetMatch[1]} ${budgetMatch[2]}` : undefined;

  // Location: line after BHK line, before the price — typically area name like "Gurukul"
  // Try extracting from the text between property type and price
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  let location: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    if (/\d\s*BHK/i.test(lines[i])) {
      // Next non-empty line that isn't a price or "sq. ft." is likely the location
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const candidate = lines[j];
        if (!candidate) continue;
        if (/₹|sq\s*\.?\s*ft|property id|view details/i.test(candidate)) continue;
        if (/^\d/.test(candidate) && /sq/i.test(candidate)) continue;
        if (candidate.length > 2 && candidate.length < 60 && /^[A-Z]/i.test(candidate)) {
          location = candidate;
          break;
        }
      }
      break;
    }
  }

  // Property type: "1 BHK Apartment"
  const propertyType = bhkMatch?.[0]?.trim();

  // sq ft
  const sqftMatch = body.match(/([\d,]+)\s*sq\s*\.?\s*ft/i);
  const sqft = sqftMatch ? sqftMatch[1].replace(/,/g, '') : undefined;

  const noteParts = [
    location && `Location: ${location}`,
    propertyType && `Property: ${propertyType}`,
    sqft && `Area: ${sqft} sq.ft`,
    budgetRaw && `Budget: ${budgetRaw}`,
  ].filter(Boolean);

  return {
    name,
    phone,
    email: undefined,
    budget,
    requirementType: 'buy',
    propertyType,
    bhkType: bhk,
    locationPreference: location,
    notes: noteParts.join(' | ') || undefined,
    leadSource: 'housing_com',
    rawMetadata: { location, bhk, budgetRaw, sqft },
  };
}

// ── Format A: Key-Value format ───────────────────────────────────────────────

function parseKeyValueFormat(body: string): ParsedPortalLead | null {
  const name = extractField(body, 'Name', 'Buyer Name', 'Customer Name', 'User Name');
  if (!name) return null;

  const phone    = extractField(body, 'Phone', 'Mobile', 'Contact', 'Phone No') ?? extractPhone(body);
  const email    = extractField(body, 'Email', 'Email ID', 'Email Address');
  const location = extractField(body, 'Location', 'City', 'Area', 'Locality');
  const reqRaw   = extractField(body, 'Requirement', 'Looking For', 'Property Type', 'Property');
  const budget   = parseBudget(extractField(body, 'Budget', 'Budget Range', 'Price Range'));
  const message  = extractField(body, 'Message', 'Query', 'Note', 'Comments');
  const bhk      = extractField(body, 'BHK', 'Configuration', 'Bedrooms');

  return {
    name,
    phone,
    email,
    budget,
    requirementType: parseRequirement(reqRaw),
    propertyType: reqRaw,
    bhkType: bhk,
    locationPreference: location,
    notes: message,
    leadSource: 'housing_com',
    rawMetadata: { location, reqRaw, message },
  };
}

// ── Main export ──────────────────────────────────────────────────────────────

export function parseHousingEmail(body: string): ParsedPortalLead | null {
  return parseContactRequestFormat(body) ?? parseKeyValueFormat(body);
}
