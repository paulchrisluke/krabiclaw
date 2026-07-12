// SEO 301 redirects for legacy legal URLs
import { createError, defineEventHandler, getMethod, getRequestHeader, getRequestURL, sendRedirect, setResponseHeader } from 'h3'
import { queryAll } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { isBlawbyTemplate } from '~/utils/template-registry'
import { TENANT_TYPES } from '~/utils/tenant-routing'

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

  const tenantRedirect = event.context.tenantRedirect as {
    toPath: string | null
    statusCode: number | null
    behavior: string
  } | null | undefined
  if (event.context.tenantType === TENANT_TYPES.TENANT && tenantRedirect) {
    if (tenantRedirect.behavior === 'gone') {
      throw createError({ statusCode: 410, statusMessage: 'Gone' })
    }
    if (tenantRedirect.behavior === 'noindex') {
      setResponseHeader(event, 'x-robots-tag', 'noindex, nofollow')
    }
    if (tenantRedirect.behavior === 'redirect') {
      if (!tenantRedirect.toPath || !/^\/(?![/\\])/.test(tenantRedirect.toPath)) {
        throw createError({ statusCode: 500, statusMessage: 'Invalid tenant redirect target' })
      }
      const statusCode = [301, 302, 307, 308].includes(tenantRedirect.statusCode ?? 0)
        ? tenantRedirect.statusCode!
        : 301
      return sendRedirect(event, `${tenantRedirect.toPath}${url.search}${url.hash}`, statusCode)
    }
  }

  // Server-side redirect for single-location sites
  // Only run if tenant data is available (set by tenant-resolution middleware)
  // Use 302 (temporary) since the single-location condition can change over time
  const isBlawbyTenant = isBlawbyTemplate({
    theme: event.context.site?.theme,
    themeId: event.context.themeId,
    vertical: event.context.site?.vertical,
  })

  if (normalizedPathname === '/' && event.context.tenantType === TENANT_TYPES.TENANT && event.context.siteId && !isBlawbyTenant) {
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
            return sendRedirect(event, `/locations/${singleLoc.slug}`, 302)
          }
        }
      } catch (err) {
        console.error('Single location redirect check failed:', err)
      }
    }
  }
})
