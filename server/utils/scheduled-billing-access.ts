import {
  validateOrganizationBillingProjection,
  type OrganizationBillingProjectionRow,
} from '~/server/utils/organization-billing'

/** Paid capabilities that are consumed directly by scheduled integrations. */
export type ScheduledPaidEntitlement =
  | 'google_business'
  | 'managed_service'
  | 'review_requests'

/**
 * Return whether a scheduled integration may run for one billing projection.
 *
 * `site_entitlements` is a compatibility projection and can be stale while a
 * subscription is being reconciled. Scheduled integrations therefore must
 * validate the organization billing projection itself and require the
 * invoice-backed paid-through boundary before using paid capabilities.
 * Missing and expired projections fail closed. A malformed projection remains
 * an operational error so the scheduled run cannot silently hide billing
 * corruption.
 */
export function hasScheduledPaidEntitlement(
  row: OrganizationBillingProjectionRow | null | undefined,
  entitlement: ScheduledPaidEntitlement,
  now = new Date(),
): boolean {
  const organizationId = row?.organization_id?.trim()
  if (!organizationId) return false
  const projection = validateOrganizationBillingProjection(row, organizationId, now)
  return projection.entitlements[entitlement] === true
}

export async function collectScheduledPaidRows<T extends OrganizationBillingProjectionRow>(
  loadPage: (_limit: number, _offset: number) => Promise<T[]>,
  entitlement: ScheduledPaidEntitlement,
  options: {
    pageSize?: number
    maxPages?: number
    maxEligible?: number
    now?: Date
  } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? 200
  const maxPages = options.maxPages ?? 10
  const maxEligible = options.maxEligible ?? 200
  const now = options.now ?? new Date()
  const eligible: T[] = []

  for (let page = 0; page < maxPages; page += 1) {
    const rows = await loadPage(pageSize, page * pageSize)
    if (rows.length > pageSize) {
      throw new Error('Scheduled billing candidate page exceeded its requested bound')
    }
    for (const row of rows) {
      if (hasScheduledPaidEntitlement(row, entitlement, now)) eligible.push(row)
      if (eligible.length >= maxEligible) return eligible
    }
    if (rows.length < pageSize) return eligible
  }

  throw new Error('Scheduled billing candidate scan exceeded its bounded page window')
}
