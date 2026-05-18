import type { ParsedPortalLead } from './portal-lead.interface';

/**
 * 99acres lead email format:
 *
 * Subject: New Enquiry – <Property Name> | 99acres.com
 * From:    noreply@99acres.com  /  leads@99acres.com
 *
 * Body (plain text):
 *   Name       : Rahul Sharma
 *   Mobile     : 9876543210
 *   Email      : rahul@gmail.com
 *   City       : Ahmedabad
 *   Requirement: 3 BHK Flat
 *   Budget     : 50 - 70 Lacs
 *   Message    : Looking for ready to move flat in prahlad nagar
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
  // Handle "50 - 70 Lacs", "1.5 Cr", "₹50,00,000" etc.
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
  if (l.includes('rent') || l.includes('lease')) return 'rent';
  if (l.includes('invest')) return 'investment';
  return 'buy';
}

export function parse99AcresEmail(body: string): ParsedPortalLead | null {
  const name = extractField(body, 'Name', 'Buyer Name', 'Customer Name');
  if (!name) return null;

  const phone   = extractField(body, 'Mobile', 'Phone', 'Contact', 'Contact No', 'Mobile No');
  const email   = extractField(body, 'Email', 'Email ID', 'Email Id');
  const city    = extractField(body, 'City', 'Location', 'Area');
  const reqRaw  = extractField(body, 'Requirement', 'Property Type', 'Looking For');
  const budget  = parseBudget(extractField(body, 'Budget', 'Budget Range'));
  const message = extractField(body, 'Message', 'Comments', 'Note', 'Query');
  const bhk     = extractField(body, 'BHK', 'Configuration', 'Property Config');

  return {
    name,
    phone,
    email,
    budget,
    requirementType: parseRequirement(reqRaw),
    propertyType: reqRaw,
    bhkType: bhk,
    locationPreference: city,
    notes: message,
    leadSource: '99acres',
    rawMetadata: { city, reqRaw, message },
  };
}
