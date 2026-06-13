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
    max_sites: 1,
    max_locations: 1,
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
      return {
        ...base,
        translation: true,
        translation_languages: 1,
        ai_credits: 2000,
        google_business: true,
        custom_domains: true,
      }
    case 'managed':
      return {
        ...base,
        translation: true,
        translation_languages: -1,
        ai_credits: 'unlimited',
        managed_service: true,
        custom_domains: true,
        google_business: true,
        advanced_seo: true,
        max_locations: -1,
      }
    case 'seo_accelerator':
      return {
        ...base,
        translation: true,
        translation_languages: -1,
        ai_credits: 'unlimited',
        managed_service: true,
        seo_accelerator: true,
        custom_domains: true,
        google_business: true,
        advanced_seo: true,
        max_locations: -1,
      }
    default:
      return base
  }
}

export function renderOrganizationEntitlementsSql(
  organizationId: string,
  plan: string,
  sqlValue: SqlValue,
) {
  const rows = Object.entries(entitlementValuesForPlan(plan))
    .map(([key, value]) => `  (${[
      sqlValue(`ent-${organizationId}-${key}`),
      sqlValue(organizationId),
      sqlValue(key),
      sqlValue(String(value)),
      sqlValue('seed'),
      'CURRENT_TIMESTAMP',
      'CURRENT_TIMESTAMP',
    ].join(', ')})`)
    .join(',\n')

  return `INSERT OR REPLACE INTO organization_entitlements
  (id, organization_id, key, value, source, created_at, updated_at)
VALUES
${rows};`
}

export function renderOrganizationBillingSql(
  organizationId: string,
  organizationBilling: SeedBillingState | null | undefined,
  sqlValue: SqlValue,
) {
  if (!organizationBilling) return ''
  return `INSERT OR REPLACE INTO organization_billing (id, organization_id, status, plan)
VALUES (${sqlValue(`billing-${organizationId}`)}, ${sqlValue(organizationId)}, ${sqlValue(organizationBilling.status)}, ${sqlValue(organizationBilling.plan)});`
}
