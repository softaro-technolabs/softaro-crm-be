import type { ParsedPortalLead } from './portal-lead.interface';

/**
 * MagicBricks lead email format:
 *
 * Subject: New Lead from MagicBricks – <Property Name>
 * From:    noreply@magicbricks.com  /  leads@magicbricks.com
 *
 * Body (plain text):
 *   Lead Details
 *   Name         : Rahul Sharma
 *   Contact No   : 9876543210
 *   Email ID     : rahul@example.com
 *   Property Type: Apartment
 *   Location     : Prahlad Nagar, Ahmedabad
 *   Budget       : 50 Lacs - 70 Lacs
 *   Message      : Looking for 3BHK ready to move
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
  // "50 Lacs - 70 Lacs" → take lower bound
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
  if (l.includes('invest') || l.includes('commercial')) return 'investment';
  return 'buy';
}

export function parseMagicBricksEmail(body: string): ParsedPortalLead | null {
  const name = extractField(body, 'Name', 'Buyer Name', 'Sender Name', 'Customer Name');
  if (!name) return null;

  const phone    = extractField(body, 'Contact No', 'Mobile', 'Phone', 'Contact Number', 'Mobile No');
  const email    = extractField(body, 'Email ID', 'Email', 'Email Address');
  const location = extractField(body, 'Location', 'City', 'Area', 'Locality', 'Project Location');
  const reqRaw   = extractField(body, 'Property Type', 'Requirement', 'Looking For', 'Property');
  const budget   = parseBudget(extractField(body, 'Budget', 'Budget Range', 'Price'));
  const message  = extractField(body, 'Message', 'Query', 'Comment', 'Note', 'Requirement Details');
  const bhk      = extractField(body, 'BHK', 'Bedroom', 'Configuration');

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
    leadSource: 'magicbricks',
    rawMetadata: { location, reqRaw, message },
  };
}
