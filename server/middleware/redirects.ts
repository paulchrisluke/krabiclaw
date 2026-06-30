// SEO 301 redirects for legacy legal URLs
import { defineEventHandler, getMethod, getRequestHeader, getRequestURL, sendRedirect } from 'h3'
import { queryAll } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'

const redirects: Record<string, string> = {
  '/docs/mcp-setup': '/docs/integrations/mcp-setup',
  '/privacy-policy': '/privacy',
  '/terms-and-conditions': '/terms',
}

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const normalizedPathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '')

  // The MCP connector URL is meant for ChatGPT's "Connect" flow, but people
  // tap it directly from emails/WhatsApp messages instead of copying it.
  // Send browsers (GET requesting HTML) to the docs page explaining what this
  // URL is for; leave POST and non-browser GET clients (MCP probes) alone so
  // they still reach server/api/mcp.post.ts.
  if (
    normalizedPathname === '/api/mcp' &&
    getMethod(event) === 'GET' &&
    (getRequestHeader(event, 'accept') ?? '').includes('text/html')
  ) {
    return sendRedirect(event, '/docs/integrations/mcp-setup', 302)
  }

  const target = redirects[normalizedPathname]
  if (target) {
    const targetWithParams = `${target}${url.search}${url.hash}`
    // Permanent redirect for SEO
    return sendRedirect(event, targetWithParams, 301)
  }

  // Server-side 301 redirect for single-location sites
  if (normalizedPathname === '/' && event.context.tenantType === 'tenant' && event.context.siteId) {
    const env = cloudflareEnv(event)
    const db = env.db
    if (db) {
      try {
        const locations = await queryAll<{ slug: string }>(db, `
          SELECT slug FROM business_locations
          WHERE site_id = ? AND status = 'active'
        `, [event.context.siteId])
        if (locations.length === 1) {
          const singleLoc = locations[0]
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
