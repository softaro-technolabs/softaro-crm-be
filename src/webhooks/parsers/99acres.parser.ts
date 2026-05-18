import type { ParsedPortalLead } from './portal-lead.interface';

/**
 * 99acres lead email — two formats are handled:
 *
 * FORMAT A – "Buyer Response" notification (actual 99acres email):
 *   Subject: You've got a new buyer response
 *   From:    nnacres-services@99acres.com
 *
 *   Body:
 *     You've got a new buyer response
 *     Hey <Agent>, <Buyer> has shown interest in your 2 BHK property in <City> (ID-XXXXXXX)
 *     Response Details
 *     Recorded at ...
 *     <Buyer Name>
 *     Buyer
 *     +91-XXXXXXXXXX
 *     buyer@email.com
 *
 * FORMAT B – Key-Value format (some 99acres plans):
 *   Name    : Rahul Sharma
 *   Mobile  : 9876543210
 *   Email   : rahul@gmail.com
 *   City    : Ahmedabad
 *   Budget  : 50 - 70 Lacs
 */

// ── Helpers ────────────────────────────────────────────────────────────────

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
  // Matches: +91-9876543210 / +919876543210 / 09876543210 / 9876543210
  const match = text.match(/(?:\+91[-\s]?|0)?[6-9]\d{9}/);
  return match?.[0]?.replace(/[-\s]/g, '') || undefined;
}

function extractEmail(text: string): string | undefined {
  const match = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match?.[0] || undefined;
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
  if (l.includes('rent') || l.includes('lease')) return 'rent';
  if (l.includes('invest')) return 'investment';
  return 'buy';
}

// ── Format A: "Buyer Response" notification ────────────────────────────────

function parseBuyerResponseFormat(body: string): ParsedPortalLead | null {
  // Must contain the buyer response signature
  if (!/new buyer response/i.test(body) && !/shown interest/i.test(body)) return null;

  // Extract buyer name from the intro line:
  // "Hey <Agent>, <Buyer Name> has shown interest in your..."
  // OR from the block after "Response Details\n<timestamp>\n<Name>"
  let name: string | undefined;

  // Try: extract from "has shown interest" line
  const introMatch = body.match(/Hey\s+[^,]+,\s+(.+?)\s+has shown interest/i);
  if (introMatch?.[1]) {
    name = introMatch[1].trim();
  }

  // Fallback: extract from the block after "Recorded at ..."
  // The name appears on the next non-empty line after the timestamp
  if (!name) {
    const afterTimestamp = body.match(/Recorded at[^\n]*\n+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/m);
    if (afterTimestamp?.[1]) name = afterTimestamp[1].trim();
  }

  if (!name || name.length < 2) return null;

  // Extract phone and email from the full body
  const phone = extractPhone(body);
  const email = extractEmail(body);

  // Extract location from: "property in <Location> (ID-...)"
  const locationMatch = body.match(/property in\s+(.+?)\s*[-–(]/i);
  const city = locationMatch?.[1]?.trim();

  // Extract BHK from: "your 2 BHK property" or "3 BHK"
  const bhkMatch = body.match(/(\d\s*BHK)/i);
  const bhk = bhkMatch?.[1]?.replace(/\s+/, '') || undefined;

  // Extract budget hints from "Most of their searches are within X - Y"
  const budgetRangeMatch = body.match(/searches are within\s+([\d,.\s]+(?:lacs?|cr(?:ore)?)?)\s*[-–]\s*([\d,.\s]+(?:lacs?|cr(?:ore)?)?)/i);
  const budgetRaw = budgetRangeMatch ? `${budgetRangeMatch[1]} - ${budgetRangeMatch[2]}` : undefined;

  return {
    name,
    phone,
    email,
    budget: parseBudget(budgetRaw),
    requirementType: 'buy',
    bhkType: bhk,
    locationPreference: city,
    notes: `99acres buyer response — ${city ?? ''} ${bhk ?? ''}`.trim(),
    leadSource: '99acres',
    rawMetadata: { city, bhk, budgetRaw },
  };
}

// ── Format B: Key-Value format ─────────────────────────────────────────────

function parseKeyValueFormat(body: string): ParsedPortalLead | null {
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

// ── Main export ────────────────────────────────────────────────────────────

export function parse99AcresEmail(body: string): ParsedPortalLead | null {
  // Try buyer-response format first (most common actual 99acres email)
  return parseBuyerResponseFormat(body) ?? parseKeyValueFormat(body);
}
