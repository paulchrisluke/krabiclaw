import type { H3Event } from 'nitro'
import { requireOrganizationAccess } from '~/server/utils/location-access'

// Blog is a site-wide manager (blog_posts has no location_id) — requireOrganizationAccess's
// default 'site-wide' access class already rejects a location-scoped-only editor.
export async function requireBlogAccess(event: H3Event, organizationId: string) {
  return await requireOrganizationAccess(event, organizationId)
}
