import { queryAll, type DbClient } from '~/server/db'

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

export async function loadOrganizationSiteSummaries(
  db: DbClient,
  organizationId: string,
  billingStatus: OrganizationBillingSummary,
) {
  const rows = await queryAll<OrganizationSiteRow>(db, `
    SELECT s.id, s.brand_name, s.subdomain
      FROM sites s
     WHERE s.organization_id = ?
     ORDER BY s.created_at ASC
  `, [organizationId])
  return mapOrganizationSites(rows ?? [], billingStatus)
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
