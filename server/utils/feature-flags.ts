// Platform-wide feature flags — plain Cloudflare env vars, off by default,
// no wrangler.toml/runtimeConfig entry (same convention as the
// CONVERSATIONAL_TOOLS_*_ENABLED flags in conversational-tool-surface.ts).

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled'])

function flagEnabled(env: ApiRecord | undefined, key: string): boolean {
  const raw = env?.[key]
  return typeof raw === 'string' && TRUE_VALUES.has(raw.trim().toLowerCase())
}

/**
 * Controls whether legal practice read operations are enabled for Blawby integration.
 * Callers must additionally check the site's legal_operations entitlement.
 */
export function isLegalPracticeReadEnabled(env: ApiRecord | undefined): boolean {
  return flagEnabled(env, 'LEGAL_PRACTICE_READ_ENABLED')
}

/**
 * Controls whether legal practice mutation operations are enabled for Blawby integration.
 * Callers must additionally check the site's legal_operations entitlement.
 */
export function isLegalPracticeMutationEnabled(env: ApiRecord | undefined): boolean {
  return flagEnabled(env, 'LEGAL_PRACTICE_MUTATION_ENABLED')
}

/**
 * Controls whether legal Connect operations are enabled for Blawby integration.
 * Callers must additionally check the site's legal_operations entitlement.
 */
export function isLegalConnectEnabled(env: ApiRecord | undefined): boolean {
  return flagEnabled(env, 'LEGAL_CONNECT_ENABLED')
}

/**
 * Controls whether legal intake without payment operations are enabled for Blawby integration.
 * Callers must additionally check the site's legal_operations entitlement.
 */
export function isLegalIntakeWithoutPaymentEnabled(env: ApiRecord | undefined): boolean {
  return flagEnabled(env, 'LEGAL_INTAKE_WITHOUT_PAYMENT_ENABLED')
}

/**
 * Controls whether legal intake payment operations are enabled for Blawby integration.
 * Callers must additionally check the site's legal_operations entitlement.
 */
export function isLegalIntakePaymentEnabled(env: ApiRecord | undefined): boolean {
  return flagEnabled(env, 'LEGAL_INTAKE_PAYMENT_ENABLED')
}

/**
 * Controls whether legal engagement operations are enabled for Blawby integration.
 * Callers must additionally check the site's legal_operations entitlement.
 */
export function isLegalEngagementEnabled(env: ApiRecord | undefined): boolean {
  return flagEnabled(env, 'LEGAL_ENGAGEMENT_ENABLED')
}
