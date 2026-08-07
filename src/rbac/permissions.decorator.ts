import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'rbac_permissions';

/** A `module-slug.action` code, e.g. `leads.read`. */
export type PermissionRequirement = string;

/**
 * Declares the permissions a handler needs.
 *
 * Multiple codes are OR'd — the caller needs any one of them. This matters
 * because the seeded action list contains overlapping verbs (`read`/`view`,
 * `write`/`create`), and roles configured before a given endpoint existed may
 * carry either.
 *
 * Tenant admins and super-admins bypass these checks entirely.
 */
export const Permissions = (...permissions: PermissionRequirement[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Canonical action verbs, so call sites stop inventing new ones. */
export const ACTIONS = {
  READ: ['read', 'view'],
  WRITE: ['write', 'create'],
  UPDATE: ['update', 'write'],
  DELETE: ['delete'],
  EXPORT: ['export'],
} as const;

/** Builds the OR-set for a module, e.g. `perms('leads', ACTIONS.READ)`. */
export const perms = (moduleSlug: string, actions: readonly string[]): PermissionRequirement[] =>
  actions.map((action) => `${moduleSlug}.${action}`);
