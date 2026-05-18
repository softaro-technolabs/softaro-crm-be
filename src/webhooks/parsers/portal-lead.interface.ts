import type { LeadSource } from '../../leads/leads.dto';

/**
 * Normalised lead data extracted from a portal email.
 * All fields are optional except name — parsers fill what they can.
 */
export interface ParsedPortalLead {
  name: string;
  phone?: string;
  email?: string;
  budget?: number;
  requirementType?: 'buy' | 'rent' | 'investment';
  propertyType?: string;
  bhkType?: string;
  locationPreference?: string;
  notes?: string;
  leadSource: LeadSource;
  /** Raw portal-specific data for audit / debugging */
  rawMetadata?: Record<string, unknown>;
}
