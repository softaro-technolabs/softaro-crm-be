import type { ParsedPortalLead } from './portal-lead.interface';

/**
 * Housing.com lead email format:
 *
 * Subject: New Lead | <Property Name> | Housing.com
 * From:    no-reply@housing.com  /  leads@housing.com
 *
 * Body (plain text):
 *   Buyer Details:
 *   Name    : Rahul Sharma
 *   Phone   : +91 9876543210
 *   Email   : rahul@example.com
 *   Requirement: 3 BHK Flat
 *   Location: Prahlad Nagar, Ahmedabad
 *   Budget  : 50 - 70 Lacs
 *   Message : Looking for ready possession
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

export function parseHousingEmail(body: string): ParsedPortalLead | null {
  const name = extractField(body, 'Name', 'Buyer Name', 'Customer Name', 'User Name');
  if (!name) return null;

  const phone    = extractField(body, 'Phone', 'Mobile', 'Contact', 'Phone No');
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
