// SEO 301 redirects for legacy legal URLs
import { createError, defineEventHandler, getMethod, getRequestHeader, getRequestURL, sendRedirect, setResponseHeader } from 'h3'
import { queryAll, queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { isBlawbyTemplate } from '~/utils/template-registry'
import { TENANT_TYPES } from '~/utils/tenant-routing'
import { tenantBlogPostPath } from '~/utils/tenant-blog-route'
import { blogCategoryToSlug } from '~/utils/blog-categories'

const redirects: Record<string, string> = {
  '/docs/mcp-setup': '/docs/integrations/mcp-setup',
  '/privacy-policy': '/privacy',
  '/terms-and-conditions': '/terms',
  // These three don't and never did exist as real doc slugs (confirmed
  // against production platform_docs) — found via real "Documentation not
  // found" 404s from a live tenant domain. Nothing in this codebase emits
  // these URLs, so the most likely source is an LLM (e.g. ChatGPT, asked
  // "how do I connect KrabiClaw to ChatGPT") guessing a plausible-looking
  // docs path and telling a real business owner to visit it — same class of
  // hallucination as the open_media_upload MCP tool-name issue. Redirecting
  // to the closest real doc turns a dead link real users are hitting into a
  // working one, without us controlling what the LLM says elsewhere.
  '/docs/getting-started/getting-started-with-krabiclaw-in-chatgpt': '/docs/getting-started/getting-started',
  '/docs/getting-started/getting-started-with-krabiclaw': '/docs/getting-started/getting-started',
  '/docs/getting-started/connect-krabiclaw-to-chatgpt': '/docs/integrations/mcp-setup',
}

function safeDecodePathSegment(value: string) {
  try { return decodeURIComponent(value) } catch { return null }
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
      const isLocalTarget = Boolean(tenantRedirect.toPath && /^\/(?![/\\])/.test(tenantRedirect.toPath))
      const isApprovedMediaTarget = (() => {
        try {
          const targetUrl = new URL(tenantRedirect.toPath || '')
          return targetUrl.protocol === 'https:' && ['media.krabiclaw.com', 'images.krabiclaw.com'].includes(targetUrl.hostname)
        } catch {
          return false
        }
      })()
      if (!isLocalTarget && !isApprovedMediaTarget) {
        throw createError({ statusCode: 500, statusMessage: 'Invalid tenant redirect target' })
      }
      const statusCode = [301, 302, 307, 308].includes(tenantRedirect.statusCode ?? 0)
        ? tenantRedirect.statusCode!
        : 301
      const target = isLocalTarget
        ? `${tenantRedirect.toPath}${url.search}${url.hash}`
        : (() => {
            const external = new URL(tenantRedirect.toPath!)
            external.search = url.search
            external.hash = url.hash
            return external.toString()
          })()
      return sendRedirect(event, target, statusCode)
    }
  }

  // Durable blog slugs are separate from tenant-page redirects because they
  // are scoped to blog_posts and must work on both Saya (/blog) and Blawby
  // (/article) route surfaces.
  if (getMethod(event) === 'GET') {
    const env = cloudflareEnv(event)
    const db = env.db
    const tenantMatch = normalizedPathname.match(/^\/(?:blog|article)\/([^/]+)$/)
    if (db && tenantMatch && event.context.tenantType === TENANT_TYPES.TENANT && event.context.siteId) {
      const oldSlug = safeDecodePathSegment(tenantMatch[1]!)
      if (oldSlug !== null) {
        try {
          const redirected = await queryFirst<{ slug: string } | null>(db, `
            SELECT p.slug FROM blog_post_redirects r JOIN blog_posts p ON p.id = r.post_id
             WHERE r.site_id = ? AND p.site_id = ? AND r.old_slug = ? AND p.status = 'published' LIMIT 1
          `, [event.context.siteId, event.context.siteId, oldSlug])
          if (redirected) return sendRedirect(event, `${tenantBlogPostPath(event.context.site ?? null, redirected.slug)}${url.search}${url.hash}`, 301)
        } catch (error) {
          console.error('Tenant blog redirect lookup failed', error)
        }
      }
    }
    const platformMatch = normalizedPathname.match(/^\/blog\/[^/]+\/([^/]+)$/)
    if (db && platformMatch && event.context.tenantType === TENANT_TYPES.PLATFORM) {
      const oldSlug = safeDecodePathSegment(platformMatch[1]!)
      if (oldSlug !== null) {
        try {
          const redirected = await queryFirst<{ slug: string; category: string | null } | null>(db, `
            SELECT p.slug, p.category FROM blog_post_redirects r JOIN blog_posts p ON p.id = r.post_id
             WHERE r.site_id IS NULL AND p.site_id IS NULL AND r.old_slug = ? AND p.status = 'published' LIMIT 1
          `, [oldSlug])
          const category = blogCategoryToSlug(redirected?.category)
          if (redirected && category) return sendRedirect(event, `/blog/${category}/${encodeURIComponent(redirected.slug)}${url.search}${url.hash}`, 301)
        } catch (error) {
          console.error('Platform blog redirect lookup failed', error)
        }
      }
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
