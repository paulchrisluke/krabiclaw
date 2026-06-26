import { execute, queryAll, queryFirst } from '~/server/db'

export interface McpWorkspacePreferenceRow {
  user_id: string
  organization_id: string | null
  site_id: string | null
  location_id: string | null
  created_at: string
  updated_at: string
}

export interface McpSiteSummary {
  id: string
  organization_id: string
  organization_name: string | null
  organization_slug: string | null
  brand_name: string | null
  subdomain: string | null
  custom_domain: string | null
  public_url: string | null
  status: string
  onboarding_status: string
  role: string
  primary_location_id: string | null
}

export interface McpOrganizationSummary {
  id: string
  name: string | null
  slug: string | null
}

export interface McpLocationSummary {
  id: string
  slug: string
  title: string
  city: string | null
  status: string
  is_primary: boolean
}

export interface ResolvedMcpWorkspace {
  preference: McpWorkspacePreferenceRow | null
  organization: McpOrganizationSummary | null
  site: McpSiteSummary | null
  location: McpLocationSummary | null
  organizations: McpOrganizationSummary[]
  sites: McpSiteSummary[]
  locations: McpLocationSummary[]
}

interface ResolveWorkspaceOptions {
  organizationId?: string | null
  siteId?: string | null
  locationId?: string | null
  requireSite?: boolean
  requireLocation?: boolean
}

function normalizeId(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || null
}

export async function getMcpWorkspacePreference(
  db: D1Database,
  userId: string,
) {
  return await queryFirst<McpWorkspacePreferenceRow>(db, `
    SELECT user_id, organization_id, site_id, location_id, created_at, updated_at
    FROM mcp_workspace_preferences
    WHERE user_id = ?
    LIMIT 1
  `, [userId])
}

export async function listAccessibleSitesForMcp(
  db: D1Database,
  userId: string,
  isPlatformAdmin: boolean,
) {
  if (isPlatformAdmin) {
    return await queryAll<McpSiteSummary>(db, `
      SELECT s.id, s.organization_id, o.name AS organization_name, o.slug AS organization_slug,
             s.brand_name, s.subdomain, s.custom_domain, s.public_url, s.status, s.onboarding_status,
             s.primary_location_id, 'owner' AS role
      FROM sites s
      LEFT JOIN organization o ON o.id = s.organization_id
      ORDER BY s.updated_at DESC, s.created_at DESC
    `)
  }

  return await queryAll<McpSiteSummary>(db, `
    SELECT s.id, s.organization_id, o.name AS organization_name, o.slug AS organization_slug,
           s.brand_name, s.subdomain, s.custom_domain, s.public_url, s.status, s.onboarding_status,
           s.primary_location_id, m.role
    FROM sites s
    JOIN organization o ON o.id = s.organization_id
    JOIN member m ON m.organizationId = s.organization_id
    WHERE m.userId = ?
    ORDER BY s.updated_at DESC, s.created_at DESC
  `, [userId])
}

export async function listLocationsForMcp(
  db: D1Database,
  organizationId: string,
  siteId: string,
) {
  const results = await queryAll<{
    id: string
    slug: string
    title: string
    city: string | null
    status: string
    is_primary: number | boolean
  }>(db, `
    SELECT id, slug, title, city, status, is_primary
    FROM business_locations
    WHERE organization_id = ? AND site_id = ?
    ORDER BY is_primary DESC, title ASC
  `, [organizationId, siteId])

  return results.map((location) => ({
    ...location,
    is_primary: Boolean(location.is_primary),
  }))
}

export async function resolveMcpWorkspace(
  db: D1Database,
  userId: string,
  isPlatformAdmin: boolean,
  options: ResolveWorkspaceOptions = {},
): Promise<ResolvedMcpWorkspace> {
  const preference = await getMcpWorkspacePreference(db, userId)
  const sites = await listAccessibleSitesForMcp(db, userId, isPlatformAdmin)
  const organizations = Array.from(
    new Map(
      sites.map((site) => [
        site.organization_id,
        {
          id: site.organization_id,
          name: site.organization_name,
          slug: site.organization_slug,
        } satisfies McpOrganizationSummary,
      ]),
    ).values(),
  )

  const requestedOrganizationId = normalizeId(options.organizationId)
  const preferredOrganizationId = normalizeId(preference?.organization_id)
  const requestedSiteId = normalizeId(options.siteId)
  const preferredSiteId = normalizeId(preference?.site_id)
  const scopedSites = requestedOrganizationId
    ? sites.filter((entry) => entry.organization_id === requestedOrganizationId)
    : requestedSiteId
      ? sites
      : preferredOrganizationId
        ? sites.filter((entry) => entry.organization_id === preferredOrganizationId)
        : sites
  // Exact technical identifiers (subdomain, custom domain) resolve directly here —
  // they're unambiguous and the full candidate list is already in memory, so this
  // costs nothing extra. Fuzzy name matching deliberately is not attempted: two
  // sites/locations can share a word in their name, and guessing wrong is worse
  // than requiring list_sites/list_locations first for that case.
  let site = requestedSiteId
    ? scopedSites.find((entry) => entry.id === requestedSiteId) ??
      scopedSites.find((entry) =>
        entry.subdomain === requestedSiteId ||
        entry.custom_domain === requestedSiteId,
      ) ??
      null
    : null

  if (!requestedSiteId) {
    if (!site && preferredSiteId) {
      site = scopedSites.find((entry) => entry.id === preferredSiteId) ?? null
    }
    if (!site && scopedSites.length === 1) {
      site = scopedSites[0] ?? null
    }
  }
  const organization = site
    ? organizations.find((entry) => entry.id === site.organization_id) ?? null
    : requestedOrganizationId
      ? organizations.find((entry) => entry.id === requestedOrganizationId) ?? null
      : preferredOrganizationId
        ? organizations.find((entry) => entry.id === preferredOrganizationId) ?? null
        : organizations.length === 1
          ? organizations[0] ?? null
          : null

  if (options.requireSite && !site) {
    throw new Error(
      scopedSites.length === 0
        ? 'No accessible site found.'
        : 'Site context is required. Call set_workspace_context or pass site_id explicitly.',
    )
  }

  const locations = site
    ? await listLocationsForMcp(db, site.organization_id, site.id)
    : []

  const requestedLocationId = normalizeId(options.locationId)
  const preferredLocationId = normalizeId(preference?.location_id)
  let location = requestedLocationId
    ? locations.find((entry) => entry.id === requestedLocationId) ??
      locations.find((entry) => entry.slug === requestedLocationId) ??
      null
    : null

  if (!requestedLocationId) {
    if (!location && preferredLocationId) {
      location = locations.find((entry) => entry.id === preferredLocationId) ?? null
    }
    if (!location && site?.primary_location_id) {
      location = locations.find((entry) => entry.id === site.primary_location_id) ?? null
    }
    if (!location && locations.length === 1) {
      location = locations[0] ?? null
    }
  }

  if (options.requireLocation && !location) {
    throw new Error(
      locations.length === 0
        ? 'No location found for the active site.'
        : 'Location context is required. Call set_workspace_context or pass location_id explicitly.',
    )
  }

  return {
    preference: preference ?? null,
    organization,
    site,
    location,
    organizations,
    sites,
    locations,
  }
}

export async function upsertMcpWorkspacePreference(
  db: D1Database,
  input: {
    userId: string
    organizationId: string | null
    siteId: string | null
    locationId: string | null
  },
) {
  const now = new Date().toISOString()
  await execute(db, `
    INSERT INTO mcp_workspace_preferences (
      user_id, organization_id, site_id, location_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      organization_id = excluded.organization_id,
      site_id = excluded.site_id,
      location_id = excluded.location_id,
      updated_at = excluded.updated_at
  `, [
    input.userId,
    input.organizationId,
    input.siteId,
    input.locationId,
    now,
    now,
  ])
}
