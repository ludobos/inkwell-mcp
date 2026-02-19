/**
 * Simplified auth for Inkwell MCP.
 * Owner mode (single user) or public mode (no auth).
 */

import type { AuthContext } from './types.js';

export function requireOwner(ctx: AuthContext | null): AuthContext {
  if (!ctx || ctx.role !== 'owner') {
    throw { code: 403, message: 'Owner access required' };
  }
  return ctx;
}

export function resolveAuth(authEnabled: boolean, ownerKey?: string, providedKey?: string): AuthContext | null {
  if (!authEnabled) {
    // No auth = everyone is owner
    return { role: 'owner' };
  }

  if (!providedKey || !ownerKey) {
    return { role: 'public' };
  }

  if (providedKey === ownerKey) {
    return { role: 'owner' };
  }

  return { role: 'public' };
}
