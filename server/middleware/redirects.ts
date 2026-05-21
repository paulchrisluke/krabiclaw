// SEO 301 redirects for legacy legal URLs
import { defineEventHandler, getRequestURL, sendRedirect } from 'h3'

const redirects: Record<string, string> = {
  '/privacy-policy': '/privacy',
  '/terms-and-conditions': '/terms',
}

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const normalizedPathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '')
  const target = redirects[normalizedPathname]
  if (target) {
    const targetWithParams = `${target}${url.search}${url.hash}`
    // Permanent redirect for SEO
    return sendRedirect(event, targetWithParams, 301)
  }

  // Server-side 301 redirect for single-location sites
  if (normalizedPathname === '/' && event.context.tenantType === 'tenant' && event.context.siteId) {
    const env = cloudflareEnv(event)
    const db = env.DB
    if (db) {
      try {
        const locations = await db.prepare(`
          SELECT slug FROM business_locations
          WHERE site_id = ? AND status = 'active'
        `).bind(event.context.siteId).all<{ slug: string }>()
        if (locations.results && locations.results.length === 1) {
          const singleLoc = locations.results[0]
          if (singleLoc && singleLoc.slug) {
            return sendRedirect(event, `/locations/${singleLoc.slug}`, 301)
          }
        }
      } catch (err) {
        console.error('Single location redirect check failed:', err)
      }
    }
  }
})
