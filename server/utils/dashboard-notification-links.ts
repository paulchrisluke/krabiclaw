import { queryFirst, type DbClient } from '~/server/db'

export interface DashboardNotificationLinkEnv {
  NUXT_PUBLIC_PLATFORM_DOMAIN?: string
}

export function getPlatformDomain(env: DashboardNotificationLinkEnv): string {
  return (env.NUXT_PUBLIC_PLATFORM_DOMAIN || 'krabiclaw.com').replace(/^https?:\/\//, '').replace(/\/$/, '')
}

export interface SiteLocationSlugs {
  orgSlug: string
  siteSlug: string
  locationSlug: string | null
}

// Thread deep links are scope-sensitive: site-wide records go to the site inbox,
// while location-assigned records go to that location's inbox.
export async function resolveSiteLocationSlugs(
  db: DbClient,
  opts: { organizationId: string; siteId: string; locationId?: string | null },
): Promise<SiteLocationSlugs | null> {
  try {
    const site = await queryFirst<{ org_slug: string | null; site_slug: string | null }>(db, `
      SELECT o.slug AS org_slug, s.subdomain AS site_slug
      FROM organization o
      JOIN sites s ON s.organization_id = o.id
      WHERE o.id = ? AND s.id = ?
      LIMIT 1
    `, [opts.organizationId, opts.siteId])
    if (!site?.org_slug || !site.site_slug) return null

    let locationSlug: string | null = null
    if (opts.locationId) {
      const location = await queryFirst<{ slug: string }>(db, `
        SELECT slug FROM business_locations WHERE id = ? AND site_id = ? LIMIT 1
      `, [opts.locationId, opts.siteId])
      locationSlug = location?.slug ?? null
      if (!locationSlug) return null
    }

    return { orgSlug: site.org_slug, siteSlug: site.site_slug, locationSlug }
  } catch {
    return null
  }
}

export function composeOwnerThreadInboxUrl(
  env: DashboardNotificationLinkEnv,
  slugs: SiteLocationSlugs,
  threadId: string,
): string {
  const query = new URLSearchParams({ thread: threadId })
  const base = `https://${getPlatformDomain(env)}/dashboard/${slugs.orgSlug}/sites/${slugs.siteSlug}`
  const inboxPath = slugs.locationSlug ? `/locations/${slugs.locationSlug}/inbox` : '/inbox'
  return `${base}${inboxPath}?${query.toString()}`
}

export async function buildOwnerThreadInboxUrl(
  env: DashboardNotificationLinkEnv,
  db: DbClient,
  opts: { organizationId: string; siteId: string; locationId?: string | null; threadId: string },
): Promise<string | null> {
  const slugs = await resolveSiteLocationSlugs(db, opts)
  return slugs ? composeOwnerThreadInboxUrl(env, slugs, opts.threadId) : null
}
