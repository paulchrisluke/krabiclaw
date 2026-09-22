import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { d1JsonStringSet } from '~/server/db/d1-limits'
import type { CloudflareEnv } from '~/server/utils/auth'
import { listUserOrganizations, resolveOrganizationMembership } from '~/server/utils/member-access'

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
  /** The neighbourhood the address names, or its town. Derived, never stored. */
  place_name: string | null
  status: string
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
    FROM user_workspace_state
    WHERE user_id = ?
    LIMIT 1
  `, [userId])
}

export async function listAccessibleSitesForMcp(
  db: D1Database,
  env: CloudflareEnv,
  userId: string,
) {
  const organizations = await listUserOrganizations(env, userId)
  if (!organizations.length) return []
  const memberships = await Promise.all(organizations.map(organization =>
    resolveOrganizationMembership(env, { organizationId: organization.id, userId }),
  ))
  const organizationById = new Map(organizations.map(organization => [organization.id, organization]))
  const roleByOrganizationId = new Map(memberships.flatMap((membership, index) => membership
    ? [[organizations[index]!.id, membership.role] as const]
    : []))
  const rows = await queryAll<Omit<McpSiteSummary, 'organization_name' | 'organization_slug' | 'role'>>(db, `
    SELECT id, organization_id, brand_name, subdomain, (SELECT domain FROM site_domains WHERE site_id = sites.id AND role = 'canonical' AND status = 'active' AND type = 'custom') AS custom_domain, (SELECT 'https://' || domain FROM site_domains WHERE site_id = sites.id AND role = 'canonical' AND status = 'active') AS public_url, status,
           onboarding_status
    FROM sites
    WHERE organization_id IN (SELECT value FROM json_each(?))
    ORDER BY updated_at DESC, created_at DESC
  `, [d1JsonStringSet(organizations.map(organization => organization.id))])
  return rows.flatMap((site) => {
    const organization = organizationById.get(site.organization_id)
    const role = roleByOrganizationId.get(site.organization_id)
    return organization && role
      ? [{ ...site, organization_name: organization.name, organization_slug: organization.slug, role }]
      : []
  })
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
    place_name: string | null
    status: string
  }>(db, `
    SELECT id, slug, title, COALESCE(address ->> '$.sublocality', address ->> '$.locality') AS place_name, status
    FROM business_locations
    WHERE organization_id = ? 
    ORDER BY title ASC
  `, [organizationId])

  return results
}

export async function resolveMcpWorkspace(
  db: D1Database,
  env: CloudflareEnv,
  userId: string,
  options: ResolveWorkspaceOptions = {},
): Promise<ResolvedMcpWorkspace> {
  const preference = await getMcpWorkspacePreference(db, userId)
  const sites = await listAccessibleSitesForMcp(db, env, userId)
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

  if (requestedSiteId && !site) {
    const domain = await queryFirst<{ site_id: string }>(db, "SELECT site_id FROM site_domains WHERE domain = ? AND status = 'active' LIMIT 1", [requestedSiteId])
    site = scopedSites.find(entry => entry.id === domain?.site_id) ?? null
  }

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
  const location = requestedLocationId
    ? locations.find((entry) => entry.id === requestedLocationId) ??
      locations.find((entry) => entry.slug === requestedLocationId) ??
      null
    : null

  if (options.requireLocation && !location) {
    if (requestedLocationId) {
      throw new Error(
        `Location "${requestedLocationId}" was not found on the active site.`,
      )
    }
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
    INSERT INTO user_workspace_state (
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

export type JsonSerializable = string | number | boolean | null | { [key: string]: JsonSerializable } | JsonSerializable[]

function nowIso() {
  return new Date().toISOString()
}

function jsonOrNull(value: JsonSerializable | null | undefined): string | null {
  return value == null ? null : JSON.stringify(value)
}

export async function getWhatsAppWorkspaceState(
  db: DbClient,
  userId: string,
): Promise<{
  user_id: string
  pending_confirmation: string | null
  last_inbound_id: string | null
  updated_at: string
} | null> {
  const result = await queryFirst<{
    user_id: string
    pending_confirmation: string | null
    last_inbound_id: string | null
    updated_at: string
  }>(db, `
    SELECT user_id, whatsapp_pending_confirmation AS pending_confirmation, whatsapp_last_inbound_id AS last_inbound_id, whatsapp_updated_at AS updated_at
      FROM user_workspace_state
     WHERE user_id = ? AND whatsapp_updated_at IS NOT NULL LIMIT 1
  `, [userId])
  return result ?? null
}

export async function patchWhatsAppWorkspaceState(
  db: DbClient,
  opts: {
    userId: string
    pendingConfirmation?: JsonSerializable | null
    lastInboundId?: string | null
  }
): Promise<void> {
  const updateFields: string[] = []
  if ('pendingConfirmation' in opts) updateFields.push('whatsapp_pending_confirmation = excluded.whatsapp_pending_confirmation')
  if ('lastInboundId' in opts) updateFields.push('whatsapp_last_inbound_id = excluded.whatsapp_last_inbound_id')
  updateFields.push('whatsapp_updated_at = excluded.whatsapp_updated_at')

  await execute(db, `
    INSERT INTO user_workspace_state
      (user_id, whatsapp_pending_confirmation, whatsapp_last_inbound_id, whatsapp_updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      ${updateFields.join(',\n      ')}
  `, [
    opts.userId,
    jsonOrNull(opts.pendingConfirmation),
    opts.lastInboundId ?? null,
    nowIso(),
  ])
}
