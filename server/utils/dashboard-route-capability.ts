import { queryFirst, type DbClient } from '~/server/db'
import { resolveSiteCmsCapabilities } from '~/server/utils/cms-capabilities'

export interface RouteCapabilityParams {
  organizationSlug: string
  siteSlug: string
  locationSlug?: string | null
  capabilityKey: string
}

interface RouteCapabilitySiteRow {
  id: string
  vertical: string
  theme_id: string
  enabled_features: string | null
}

/** The route-guard half of resolveCmsCapabilities (config/cms-registry.ts) — judges ONLY
 *  whether a `key` (e.g. 'site.qa', 'location.menu') is present in the resolved capability set
 *  for this org/site/location. Deliberately does not assert membership/role access: that stays
 *  member-access.ts's job (assertMemberSiteAccess et al.), called independently by every
 *  /api/dashboard/* route regardless of what this function returns — see issue #342 requirement
 *  6, "preserve organization/site/location authorization separately from feature capability
 *  checks". A missing org/site/location resolves to `false` (fail closed → 404), which is
 *  correct for a route guard even though it isn't a real authorization decision. */
export async function isDashboardRouteCapabilityAllowed(
  db: DbClient,
  userId: string,
  params: RouteCapabilityParams,
): Promise<boolean> {
  const site = await queryFirst<RouteCapabilitySiteRow>(db, `
    SELECT s.id, s.vertical, s.theme_id, s.enabled_features
    FROM sites s
    JOIN organization o ON o.id = s.organization_id
    JOIN member m ON m.organizationId = o.id
    WHERE o.slug = ? AND s.subdomain = ? AND m.userId = ?
    LIMIT 1
  `, [params.organizationSlug, params.siteSlug, userId])
  if (!site) return false

  let locationEnabledFeatures: string | null = null
  if (params.locationSlug) {
    const location = await queryFirst<{ enabled_features: string | null }>(db, `
      SELECT enabled_features FROM business_locations
      WHERE site_id = ? AND slug = ?
      LIMIT 1
    `, [site.id, params.locationSlug])
    if (!location) return false
    locationEnabledFeatures = location.enabled_features
  }

  let capabilities: ReturnType<typeof resolveSiteCmsCapabilities>['capabilities']
  try {
    ({ capabilities } = resolveSiteCmsCapabilities(site.vertical, site.theme_id, {
      siteEnabledFeatures: site.enabled_features,
      locationEnabledFeatures,
    }))
  } catch {
    return false
  }

  return capabilities.managers.some(manager => manager.key === params.capabilityKey)
}
