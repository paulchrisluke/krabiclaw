export interface OrganizationSiteRow {
  id: string
  brand_name: string | null
  subdomain: string | null
}

export interface OrganizationBillingSummary {
  plan: string
  subscriptionStatus?: string
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
}

/**
 * Site IDs are checkout context only. Plan and subscription state always come
 * from the single organization billing resolver, even when stale site_billing
 * rows disagree across sites.
 */
export function mapOrganizationSites(
  rows: OrganizationSiteRow[],
  billingStatus: OrganizationBillingSummary,
) {
  return rows.map(row => ({
    siteId: row.id,
    brandName: row.brand_name,
    subdomain: row.subdomain,
    plan: billingStatus.plan,
    subscriptionStatus: billingStatus.subscriptionStatus,
    currentPeriodEnd: billingStatus.currentPeriodEnd,
    cancelAtPeriodEnd: billingStatus.cancelAtPeriodEnd,
  }))
}
