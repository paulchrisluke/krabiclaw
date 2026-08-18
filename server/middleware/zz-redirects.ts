// SEO 301 redirects for legacy legal URLs
import { defineHandler, HTTPError, type H3Event } from 'nitro';
import {    redirect, setResponseHeader } from 'nitro/h3';
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
  // Preserve older guessed/short docs URLs while keeping the published article
  // slug as the canonical destination.
  '/docs/getting-started/getting-started-with-krabiclaw-in-chatgpt': '/docs/getting-started/getting-started',
  '/docs/getting-started/getting-started-with-krabiclaw': '/docs/getting-started/getting-started',
  '/docs/getting-started/connect-krabiclaw-to-chatgpt': '/docs/integrations/mcp-setup',
}

// Platform-domain-only (krabiclaw.com bare host) paths Google Search Console
// keeps recrawling with no current or planned replacement (see issue #317).
// A plain 404 lets Google keep retrying indefinitely; 410 Gone is a stronger,
// faster de-index signal. Scoped to TENANT_TYPES.PLATFORM only — some of
// these (e.g. /posts) are real, valid routes on tenant sites and must keep
// working there.
const PLATFORM_GONE_PATHS = new Set(['/changelog', '/posts'])

async function resolveTenantRedirectForRequest(event: H3Event) {
  const siteId = event.context.siteId as string | null | undefined
  if (!siteId) return null
  const db = cloudflareEnv(event).db
  if (!db) return null
  const url = event.url
  const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '')
  const requestedLocale = url.searchParams.get('locale')?.trim() || (event.req.headers.get('x-tenant-locale'))?.trim() || null
  const source = await queryFirst<{ locale: string } | null>(db, `
    SELECT COALESCE((SELECT locale FROM site_locales WHERE site_id = ? AND is_source = 1 LIMIT 1), source_locale) AS locale
      FROM sites WHERE id = ? LIMIT 1
  `, [siteId, siteId])
  if (!source?.locale) return null
  const locale = requestedLocale
    ? (await queryFirst<{ locale: string } | null>(db, `
        SELECT locale FROM site_locales
         WHERE site_id = ? AND locale = ? AND status IN ('active', 'published')
         LIMIT 1
      `, [siteId, requestedLocale]))?.locale ?? requestedLocale
    : source.locale

  const exactPage = await queryFirst<{ id: string } | null>(db, `
    SELECT id FROM tenant_page_variants
     WHERE site_id = ? AND locale = ? AND path = ?
       AND status = 'published' AND published_revision_id IS NOT NULL
     LIMIT 1
  `, [siteId, locale, path])
  if (exactPage) return null

  const localeRedirect = await queryFirst<{
    toPath: string | null
    statusCode: number | null
    behavior: string
  } | null>(db, `
    SELECT to_path AS toPath, status_code AS statusCode, behavior
      FROM tenant_redirects
     WHERE site_id = ? AND locale = ? AND from_path = ?
     LIMIT 1
  `, [siteId, locale, path])
  if (localeRedirect) return localeRedirect

  return null
}

function safeDecodePathSegment(value: string) {
  try { return decodeURIComponent(value) } catch { return null }
}

export default defineHandler(async (event) => {
  const url = event.url
  const normalizedPathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '')

  // The MCP connector URL is meant for ChatGPT's "Connect" flow, but people
  // tap it directly from emails/WhatsApp messages instead of copying it.
  // Send browsers (GET requesting HTML) to the docs page explaining what this
  // URL is for; leave POST and non-browser GET clients (MCP probes) alone so
  // they still reach server/api/mcp.post.ts.
  if (
    normalizedPathname === '/api/mcp' &&
    event.req.method === 'GET' &&
    ((event.req.headers.get('accept')) ?? '').includes('text/html')
  ) {
    return redirect('/docs/integrations/mcp-setup', 302)
  }

  if (event.context.tenantType === TENANT_TYPES.PLATFORM && PLATFORM_GONE_PATHS.has(normalizedPathname)) {
    throw new HTTPError({ statusCode: 410, statusMessage: 'Gone' })
  }

  const target = redirects[normalizedPathname]
  if (target) {
    const targetWithParams = `${target}${url.search}${url.hash}`
    // Permanent redirect for SEO
    return redirect(targetWithParams, 301)
  }

  const tenantRedirect = (event.context.tenantRedirect as {
    toPath: string | null
    statusCode: number | null
    behavior: string
  } | null | undefined) ?? await resolveTenantRedirectForRequest(event)
  if (event.context.tenantType === TENANT_TYPES.TENANT && tenantRedirect) {
    if (tenantRedirect.behavior === 'gone') {
      throw new HTTPError({ statusCode: 410, statusMessage: 'Gone' })
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
        throw new HTTPError({ statusCode: 500, statusMessage: 'Invalid tenant redirect target' })
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
      return redirect(target, statusCode)
    }
  }

  // Durable blog slugs are separate from tenant-page redirects because they
  // are scoped to blog_posts and must work on both Saya (/blog) and Blawby
  // (/article) route surfaces.
  if (event.req.method === 'GET') {
    const tenantMatch = normalizedPathname.match(/^\/(?:blog|article)\/([^/]+)$/)
    if (tenantMatch && event.context.tenantType === TENANT_TYPES.TENANT && event.context.siteId) {
      const db = cloudflareEnv(event).db
      const oldSlug = safeDecodePathSegment(tenantMatch[1]!)
      if (db && oldSlug !== null) {
        try {
          const redirected = await queryFirst<{ slug: string } | null>(db, `
            SELECT p.slug FROM blog_post_redirects r JOIN blog_posts p ON p.id = r.post_id
             WHERE r.site_id = ? AND p.site_id = ? AND r.old_slug = ? AND p.status = 'published' LIMIT 1
          `, [event.context.siteId, event.context.siteId, oldSlug])
          if (redirected) {
            return redirect(`${tenantBlogPostPath({
              ...(event.context.site ?? {}),
              themeId: event.context.themeId as string | null | undefined,
            }, redirected.slug)}${url.search}${url.hash}`, 301)
          }
        } catch (error) {
          console.error('Tenant blog redirect lookup failed', error)
        }
      }
    }
    const platformMatch = normalizedPathname.match(/^\/blog\/[^/]+\/([^/]+)$/)
    if (platformMatch && event.context.tenantType === TENANT_TYPES.PLATFORM) {
      const db = cloudflareEnv(event).db
      const oldSlug = safeDecodePathSegment(platformMatch[1]!)
      if (db && oldSlug !== null) {
        try {
          const redirected = await queryFirst<{ slug: string; category: string | null } | null>(db, `
            SELECT p.slug, p.category FROM blog_post_redirects r JOIN blog_posts p ON p.id = r.post_id
             WHERE r.site_id IS NULL AND p.site_id IS NULL AND r.old_slug = ? AND p.status = 'published' LIMIT 1
          `, [oldSlug])
          const category = blogCategoryToSlug(redirected?.category)
          if (redirected && category) return redirect(`/blog/${category}/${encodeURIComponent(redirected.slug)}${url.search}${url.hash}`, 301)
        } catch (error) {
          console.error('Platform blog redirect lookup failed', error)
        }
      }
    }
  }

  // Server-side redirect for single-location sites
  // Only run if tenant data is available (set by tenant-resolution middleware)
  // Use 302 (temporary) since the single-location condition can change over time
  const isTenantRequest = normalizedPathname === '/' && event.context.tenantType === TENANT_TYPES.TENANT && event.context.siteId
  const site = event.context.site as { theme?: string | null; vertical?: string | null } | undefined
  const isBlawbyTenant = isTenantRequest && isBlawbyTemplate({
    theme: site?.theme,
    themeId: event.context.themeId as string | null | undefined,
    vertical: site?.vertical,
  })

  if (isTenantRequest && !isBlawbyTenant) {
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
            return redirect(`/locations/${singleLoc.slug}`, 302)
          }
        }
      } catch (err) {
        console.error('Single location redirect check failed:', err)
      }
    }
  }
})
