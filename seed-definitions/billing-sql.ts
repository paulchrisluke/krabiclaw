export interface SeedBillingState {
  status: string
  plan: string
}

type SqlValue = (_value: string | number | boolean | null) => string

function entitlementValuesForPlan(plan: string): Record<string, string | number | boolean> {
  const base = {
    plan,
    custom_domains: false,
    google_business: false,
    remove_branding: false,
    ai_credits: 500,
    advanced_seo: false,
    white_label: false,
    api_access: false,
    translation: false,
    translation_languages: 0,
    managed_service: false,
    seo_accelerator: false,
  }

  switch (plan) {
    case 'growth':
      return { ...base, translation: true, translation_languages: 1, ai_credits: 2000, google_business: true, custom_domains: true }
    case 'managed':
      return { ...base, translation: true, translation_languages: -1, ai_credits: 'unlimited', managed_service: true, custom_domains: true, google_business: true, advanced_seo: true }
    case 'seo_accelerator':
      return { ...base, translation: true, translation_languages: -1, ai_credits: 'unlimited', managed_service: true, seo_accelerator: true, custom_domains: true, google_business: true, advanced_seo: true }
    default:
      return base
  }
}

export function renderSiteEntitlementsSql(
  siteId: string,
  organizationId: string,
  plan: string,
  sqlValue: SqlValue,
) {
  const rows = Object.entries(entitlementValuesForPlan(plan))
    .map(([key, value]) => `  (${[
      sqlValue(`sent-${siteId}-${key}`),
      sqlValue(siteId),
      sqlValue(organizationId),
      sqlValue(key),
      sqlValue(String(value)),
      sqlValue('seed'),
      'CURRENT_TIMESTAMP',
      'CURRENT_TIMESTAMP',
    ].join(', ')})`)
    .join(',\n')

  return `INSERT OR REPLACE INTO site_entitlements
  (id, site_id, organization_id, key, value, source, created_at, updated_at)
VALUES
${rows};`
}

export function renderSiteBillingSql(
  siteId: string,
  organizationId: string,
  billing: SeedBillingState | null | undefined,
  sqlValue: SqlValue,
) {
  if (!billing) return ''
  return `INSERT OR REPLACE INTO site_billing (id, site_id, organization_id, status, plan)
VALUES (${sqlValue(`sb-${siteId}`)}, ${sqlValue(siteId)}, ${sqlValue(organizationId)}, ${sqlValue(billing.status)}, ${sqlValue(billing.plan)});`
}

// Backward-compat shims — keep old names so existing seed files compile without a mass rename
export function renderOrganizationEntitlementsSql(
  organizationId: string,
  plan: string,
  sqlValue: SqlValue,
) {
  void organizationId; void plan; void sqlValue
  throw new Error('renderOrganizationEntitlementsSql is deprecated. Migrate to renderSiteEntitlementsSql(siteId, organizationId, plan, sqlValue)')
}

export function renderOrganizationBillingSql(
  organizationId: string,
  organizationBilling: SeedBillingState | null | undefined,
  sqlValue: SqlValue,
) {
  void organizationBilling; void sqlValue
  throw new Error('renderOrganizationBillingSql is deprecated. Migrate to renderSiteBillingSql(siteId, organizationId, billing, sqlValue)')
}
