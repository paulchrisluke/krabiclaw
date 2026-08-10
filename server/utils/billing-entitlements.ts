export type EntitlementValue = string | number | boolean
export type EntitlementsMap = Record<string, EntitlementValue>

/**
 * The single application-owned plan policy used by Better Auth Stripe hooks,
 * entitlement projection, and feature checks. Stripe identifies the plan; it
 * does not define application capability policy.
 */
export function getPlanEntitlements(plan: string): EntitlementsMap {
  if (plan !== 'free' && plan !== 'growth') {
    throw new Error(`Unsupported runtime billing plan "${plan}"`)
  }
  const base: EntitlementsMap = {
    plan,
    custom_pages: false,
    custom_domains: false,
    google_business: false,
    remove_branding: false,
    ai_credits: 500,
    ai_session_credits: 100,
    advanced_seo: false,
    white_label: false,
    api_access: false,
    managed_service: false,
    messaging: false,
    review_requests: false,
  }

  switch (plan) {
    case 'growth':
      return {
        ...base,
        custom_pages: true,
        ai_credits: 2000,
        ai_session_credits: 500,
        google_business: true,
        custom_domains: true,
        managed_service: true,
        messaging: true,
        review_requests: true,
      }
    default:
      return base
  }
}
