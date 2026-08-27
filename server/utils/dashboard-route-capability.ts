import { queryFirst, type DbClient } from '~/server/db'
import { resolveSiteCmsCapabilities } from '~/server/utils/cms-capabilities'
import type { CloudflareEnv } from '~/server/utils/auth'
import { resolveUserOrganization } from '~/server/utils/member-access'

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
  feature_overrides: string | null
}

/** The route-guard half of resolveCmsCapabilities (config/cms-registry.ts) — judges ONLY
 *  whether a `key` (e.g. 'site.qa', 'location.products') is present in the resolved capability set
 *  for this org/site/location. Deliberately does not assert membership/role access: that stays
 *  member-access.ts's job (assertMemberSiteAccess et al.), called independently by every
 *  /api/dashboard/* route regardless of what this function returns — see issue #342 requirement
 *  6, "preserve organization/site/location authorization separately from feature capability
 *  checks". A missing org/site/location resolves to `false` (fail closed → 404), which is
 *  correct for a route guard even though it isn't a real authorization decision. */
export async function isDashboardRouteCapabilityAllowed(
  db: DbClient,
  env: CloudflareEnv,
  userId: string,
  params: RouteCapabilityParams,
): Promise<boolean> {
  const organization = await resolveUserOrganization(env, {
    userId,
    organizationSlug: params.organizationSlug,
  })
  if (!organization) return false
  const site = await queryFirst<RouteCapabilitySiteRow>(db, `
    SELECT s.id, s.vertical, s.theme_id, s.feature_overrides
    FROM sites s
    WHERE s.organization_id = ? AND s.subdomain = ?
    LIMIT 1
  `, [organization.id, params.siteSlug])
  if (!site) return false

  let locationFeatureOverrides: string | null = null
  if (params.locationSlug) {
    const location = await queryFirst<{ feature_overrides: string | null }>(db, `
      SELECT feature_overrides FROM business_locations
      WHERE site_id = ? AND slug = ?
      LIMIT 1
    `, [site.id, params.locationSlug])
    if (!location) return false
    locationFeatureOverrides = location.feature_overrides
  }

  const { capabilities } = resolveSiteCmsCapabilities(site.vertical, site.theme_id, {
    siteEnabledFeatures: site.feature_overrides,
    locationEnabledFeatures: locationFeatureOverrides,
  })

  return capabilities.managers.some(manager => manager.key === params.capabilityKey)
}
