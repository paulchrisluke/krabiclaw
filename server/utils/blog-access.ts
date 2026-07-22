import type { H3Event } from 'h3'
import { requireSiteAccess } from '~/server/utils/location-access'

// Blog is a site-wide manager (blog_posts has no location_id) — requireSiteAccess's
// default 'site-wide' access class already rejects a location-scoped-only editor.
export async function requireBlogAccess(event: H3Event, siteId: string) {
  return await requireSiteAccess(event, siteId)
}
