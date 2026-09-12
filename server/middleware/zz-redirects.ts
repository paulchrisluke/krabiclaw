import { defineHandler, HTTPError, type H3Event } from 'nitro';
import {    redirect, setResponseHeader } from 'nitro/h3';
import { queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { TENANT_TYPES } from '~/utils/tenant-routing'
import { resolveLocalizedRedirect } from '~/server/utils/localization'
import { resolveProductPresentation } from '~/utils/product-presentation'

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

/**
 * The experience surface became the product catalogue (#919).
 *
 * `/experiences`, `/locations/<location>/experiences`, `/experiences/<slug>`
 * and the cancellation link mailed with every booking taken before the cutover
 * are printed on cards, indexed by Google and pasted into guests' chats, so
 * they answer with the page that replaced them instead of a 404 — a
 * restaurant's classes are on its menu now, an activity operator's are in its
 * catalogue. A slug is only redirected when the product is published to this
 * site at exactly one location: with two, the old URL names no single new one,
 * and guessing which is not a redirect but a lie.
 */
async function resolveRetiredExperiencePath(event: H3Event, path: string) {
  const locationCollection = /^\/locations\/([^/]+)\/experiences$/.exec(path)
  if (path !== '/experiences' && !path.startsWith('/experiences/') && !locationCollection) return null
  const vertical = (event.context.site as { vertical?: string } | undefined)?.vertical
  const presentation = resolveProductPresentation(vertical)
  if (!presentation) return null
  if (path === '/experiences') return presentation.collectionPath
  // A guest cancelling from an email sent before the epoch. The link carries
  // the booking in its query and the token in its fragment, and the page that
  // reads both is the same page under its own name.
  if (path === '/experiences/cancel') return '/bookings/cancel'
  if (locationCollection) return `/locations/${locationCollection[1]}/${presentation.locationCollectionSegment}`

  // A stale link can carry anything; a pathname the URL parser kept but
  // percent-decoding rejects is simply not a slug we ever issued.
  let slug: string
  try {
    slug = decodeURIComponent(path.slice('/experiences/'.length))
  } catch {
    return null
  }
  if (!slug || slug.includes('/')) return null
  const db = cloudflareEnv(event).db
  const siteId = event.context.siteId as string | null | undefined
  if (!db || !siteId) return null
  const located = await queryFirst<{ location_slug: string; locations: number } | null>(db, `
    SELECT min(bl.slug) AS location_slug, count(*) AS locations
      FROM products p
      JOIN product_publications pp ON pp.product_id = p.id AND pp.site_id = ? AND pp.published = 1
      JOIN product_locations pl ON pl.product_id = p.id AND pl.published = 1
      JOIN business_locations bl ON bl.id = pl.location_id
     WHERE p.slug = ? AND p.active = 1
  `, [siteId, slug])
  if (!located || located.locations !== 1) return null
  return presentation.productPath(located.location_slug, slug)
}

async function resolveTenantRedirectForRequest(event: H3Event) {
  const siteId = event.context.siteId as string | null | undefined
  if (!siteId) return null
  const db = cloudflareEnv(event).db
  if (!db) return null
  const url = event.url
  const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '')
  const firstSegment = path.split('/')[1] || ''
  const localized = firstSegment && firstSegment !== 'en'
    ? await queryFirst<{ locale: string } | null>(db, `
        SELECT locale FROM site_locales
         WHERE site_id = ? AND locale = ? AND status = 'published'
         LIMIT 1
      `, [siteId, firstSegment])
    : null
  const locale = localized?.locale ?? 'en'
  const tenantPagePath = localized ? (path.slice(locale.length + 1) || '/') : path

  const exactPage = await queryFirst<{ id: string } | null>(db, `
    SELECT id FROM content_documents
     WHERE kind = 'page' AND row_role IN ('root','representation') AND site_id = ? AND locale = ? AND path = ?
     LIMIT 1
  `, [siteId, locale, tenantPagePath])
  if (exactPage) return null

  if (localized) {
    const site = await queryFirst<{ organization_id: string }>(db, 'SELECT organization_id FROM sites WHERE id = ? LIMIT 1', [siteId])
    if (!site) return null
    // A page miss under a locale prefix is not an entitlement check - if the
    // language license lapsed or the catalog went unavailable after this
    // locale was published, fall through to a normal 404 instead of leaking
    // the billing/catalog error to every visitor hitting a stale link.
    const resolved = await resolveLocalizedRedirect(db, site.organization_id, siteId, path).catch(error => {
      if (error instanceof HTTPError) return null
      throw error
    })
    return resolved ? { toPath: resolved.to_path, statusCode: resolved.status_code, behavior: resolved.behavior } : null
  }

  const localeRedirect = await queryFirst<{
    toPath: string | null
    statusCode: number | null
    behavior: string
  } | null>(db, `
    SELECT to_path AS toPath, status_code AS statusCode, behavior
      FROM site_redirects
     WHERE site_id = ? AND locale = ? AND from_path = ?
     LIMIT 1
  `, [siteId, locale, path])
  if (localeRedirect) return localeRedirect

  return null
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

  // After the tenant's own redirects: a merchant who has written a rule for
  // one of these paths has said where it goes, and this is the default for the
  // ones nobody wrote.
  if (event.context.tenantType === TENANT_TYPES.TENANT) {
    const retired = await resolveRetiredExperiencePath(event, normalizedPathname)
    if (retired) return redirect(`${retired}${url.search}${url.hash}`, 301)
  }

  if (event.req.method === 'GET') {
    const platformSiteId = event.context.tenantType === TENANT_TYPES.PLATFORM ? event.context.siteId as string | null : null
    if (platformSiteId) {
      const db = cloudflareEnv(event).db
      if (db) {
        try {
          const redirected = await queryFirst<{ to_path: string } | null>(db, `
            SELECT to_path FROM site_redirects
             WHERE site_id = ? AND locale = 'en' AND from_path = ? AND behavior = 'redirect' LIMIT 1
          `, [platformSiteId, normalizedPathname])
          if (redirected) return redirect(`${redirected.to_path}${url.search}${url.hash}`, 301)
        } catch (error) {
          console.error('Platform blog redirect lookup failed', error)
        }
      }
    }
  }

})
