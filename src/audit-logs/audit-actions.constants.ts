/**
 * Centralised audit action constants.
 * Format: <entity>.<verb>
 * Use these everywhere instead of raw strings so actions are consistent and searchable.
 */
export const AUDIT_ACTIONS = {
  // ── Leads ────────────────────────────────────────────────────────────────
  LEAD_CREATED:        'lead.created',
  LEAD_UPDATED:        'lead.updated',
  LEAD_DELETED:        'lead.deleted',
  LEAD_STATUS_CHANGED: 'lead.status_changed',
  LEAD_TRANSFERRED:    'lead.transferred',
  LEAD_AI_QUALIFIED:   'lead.ai_qualified',
  LEAD_IMPORTED:       'lead.imported',
  LEAD_CAPTURED:       'lead.captured',        // public capture form / webhook

  // ── Authentication ───────────────────────────────────────────────────────
  AUTH_LOGIN:           'auth.login',
  AUTH_LOGIN_FAILED:    'auth.login_failed',
  AUTH_TOKEN_REFRESHED: 'auth.token_refreshed',
  AUTH_FORGOT_PASSWORD: 'auth.forgot_password',
  AUTH_PASSWORD_RESET:  'auth.password_reset',

  // ── Users ────────────────────────────────────────────────────────────────
  USER_CREATED:        'user.created',
  USER_UPDATED:        'user.updated',
  USER_DELETED:        'user.deleted',
  USER_ROLE_CHANGED:   'user.role_changed',
  USER_STATUS_CHANGED: 'user.status_changed',

  // ── Properties ───────────────────────────────────────────────────────────
  PROPERTY_CREATED:            'property.created',
  PROPERTY_UPDATED:            'property.updated',
  PROPERTY_DELETED:            'property.deleted',
  PROPERTY_UNIT_CREATED:       'property.unit_created',
  PROPERTY_UNIT_UPDATED:       'property.unit_updated',
  PROPERTY_UNIT_DELETED:       'property.unit_deleted',
  PROPERTY_UNIT_STATUS_CHANGED:'property.unit_status_changed',

  // ── Site Visits ──────────────────────────────────────────────────────────
  SITE_VISIT_CREATED:   'site_visit.created',
  SITE_VISIT_UPDATED:   'site_visit.updated',
  SITE_VISIT_COMPLETED: 'site_visit.completed',

  // ── Automation ───────────────────────────────────────────────────────────
  AUTOMATION_RULE_CREATED:   'automation.rule_created',
  AUTOMATION_RULE_UPDATED:   'automation.rule_updated',
  AUTOMATION_RULE_DELETED:   'automation.rule_deleted',
  AUTOMATION_RULE_TOGGLED:   'automation.rule_toggled',
  AUTOMATION_RULE_TRIGGERED: 'automation.rule_triggered',

  // ── Deals ────────────────────────────────────────────────────────────────
  DEAL_CREATED: 'deal.created',
  DEAL_UPDATED: 'deal.updated',
  DEAL_DELETED: 'deal.deleted',

  // ── Quotations ───────────────────────────────────────────────────────────
  QUOTATION_CREATED: 'quotation.created',
  QUOTATION_UPDATED: 'quotation.updated',
  QUOTATION_DELETED: 'quotation.deleted',
  QUOTATION_SENT:    'quotation.sent',
} as const;

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS];
