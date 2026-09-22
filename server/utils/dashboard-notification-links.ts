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

export interface DashboardSlugs {
  orgSlug: string
  locationSlug: string | null
}

// Thread deep links are scope-sensitive: organization-wide records go to the
// dashboard inbox, while location-assigned records go to that location's.
export async function resolveDashboardSlugs(
  env: CloudflareEnv,
  db: DbClient,
  opts: { organizationId: string; locationId?: string | null },
): Promise<DashboardSlugs | null> {
  const organization = await findOrganizationById(env, opts.organizationId)
  if (!organization) return null

  let locationSlug: string | null = null
  if (opts.locationId) {
    const location = await queryFirst<{ slug: string }>(db, `
        SELECT slug FROM business_locations WHERE id = ? AND organization_id = ? LIMIT 1
      `, [opts.locationId, opts.organizationId])
    locationSlug = location?.slug ?? null
    if (!locationSlug) return null
  }

  return { orgSlug: organization.slug, locationSlug }
}

export function dashboardOrigin(env: DashboardNotificationLinkEnv, slugs: DashboardSlugs): string {
  return `https://${getPlatformDomain(env)}/dashboard/${encodeURIComponent(slugs.orgSlug)}`
}

export function composeOwnerThreadInboxUrl(
  env: DashboardNotificationLinkEnv,
  slugs: DashboardSlugs,
  threadId: string,
): string {
  // One inbox per organization: a thread opens there whichever location it
  // belongs to.
  return `${dashboardOrigin(env, slugs)}/messages/${encodeURIComponent(threadId)}`
}

export async function buildOwnerThreadInboxUrl(
  env: DashboardNotificationLinkEnv & CloudflareEnv,
  db: DbClient,
  opts: { organizationId: string; locationId?: string | null; threadId: string },
): Promise<string | null> {
  const slugs = await resolveDashboardSlugs(env, db, opts)
  return slugs ? composeOwnerThreadInboxUrl(env, slugs, opts.threadId) : null
}
