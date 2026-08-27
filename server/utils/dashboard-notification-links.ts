import { queryFirst, type DbClient } from '~/server/db'
import type { CloudflareEnv } from '~/server/utils/auth'
import { findOrganizationById } from '~/server/utils/member-access'

export interface DashboardNotificationLinkEnv {
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

export function getPlatformDomain(env: DashboardNotificationLinkEnv): string {
  const domain = env.NUXT_PUBLIC_PLATFORM_DOMAIN?.trim()
  if (!domain) throw new Error('NUXT_PUBLIC_PLATFORM_DOMAIN is required')
  return domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

export interface SiteLocationSlugs {
  orgSlug: string
  siteSlug: string
  locationSlug: string | null
}

// Thread deep links are scope-sensitive: site-wide records go to the site inbox,
// while location-assigned records go to that location's inbox.
export async function resolveSiteLocationSlugs(
  env: CloudflareEnv,
  db: DbClient,
  opts: { organizationId: string; siteId: string; locationId?: string | null },
): Promise<SiteLocationSlugs | null> {
  const [organization, site] = await Promise.all([
    findOrganizationById(env, opts.organizationId),
    queryFirst<{ site_slug: string | null }>(db, `
      SELECT subdomain AS site_slug
      FROM sites
      WHERE organization_id = ? AND id = ?
      LIMIT 1
    `, [opts.organizationId, opts.siteId]),
  ])
  if (!organization || !site?.site_slug) return null

  let locationSlug: string | null = null
  if (opts.locationId) {
    const location = await queryFirst<{ slug: string }>(db, `
        SELECT slug FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1
      `, [opts.locationId, opts.siteId])
    locationSlug = location?.slug ?? null
    if (!locationSlug) return null
  }

  return { orgSlug: organization.slug, siteSlug: site.site_slug, locationSlug }
}

export function composeOwnerThreadInboxUrl(
  env: DashboardNotificationLinkEnv,
  slugs: SiteLocationSlugs,
  threadId: string,
): string {
  const base = `https://${getPlatformDomain(env)}/dashboard/${slugs.orgSlug}/sites/${slugs.siteSlug}`
  const inboxPath = slugs.locationSlug ? `/locations/${slugs.locationSlug}/inbox` : '/inbox'
  return `${base}${inboxPath}/${encodeURIComponent(threadId)}`
}

export async function buildOwnerThreadInboxUrl(
  env: DashboardNotificationLinkEnv & CloudflareEnv,
  db: DbClient,
  opts: { organizationId: string; siteId: string; locationId?: string | null; threadId: string },
): Promise<string | null> {
  const slugs = await resolveSiteLocationSlugs(env, db, opts)
  return slugs ? composeOwnerThreadInboxUrl(env, slugs, opts.threadId) : null
}
