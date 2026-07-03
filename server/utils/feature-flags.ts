// Platform-wide feature flags — plain Cloudflare env vars, off by default,
// no wrangler.toml/runtimeConfig entry (same convention as the
// CONVERSATIONAL_TOOLS_*_ENABLED flags in conversational-tool-surface.ts).

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled'])

function flagEnabled(env: ApiRecord | undefined, key: string): boolean {
  const raw = env?.[key]
  return typeof raw === 'string' && TRUE_VALUES.has(raw.trim().toLowerCase())
}

/**
 * Gates the concierge "Managed"/"SEO Accelerator" plans as a purchasable,
 * marketed option. Off by default at launch — the underlying managed_service
 * DB entitlement, Stripe products, Facebook sync gating, and MCP tool
 * authorization are unaffected; this only controls marketing/UI visibility.
 */
export function isManagedServiceEnabled(env: ApiRecord | undefined): boolean {
  return flagEnabled(env, 'MANAGED_SERVICE_ENABLED')
}
