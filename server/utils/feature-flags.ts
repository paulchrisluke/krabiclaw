// Platform-wide feature flags — plain Cloudflare env vars, off by default,
// no wrangler.toml/runtimeConfig entry (same convention as the
// CONVERSATIONAL_TOOLS_*_ENABLED flags in conversational-tool-surface.ts).

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled'])

function flagEnabled(env: ApiRecord | undefined, key: string): boolean {
  const raw = env?.[key]
  return typeof raw === 'string' && TRUE_VALUES.has(raw.trim().toLowerCase())
}

/**
 * Controls whether managed-service operations are accepting new Growth
 * support requests. It never defines a plan or entitlement. The Growth
 * entitlement remains authoritative when the flag is off.
 */
export function isManagedServiceEnabled(env: ApiRecord | undefined): boolean {
  return flagEnabled(env, 'MANAGED_SERVICE_ENABLED')
}
