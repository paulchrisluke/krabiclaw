import { getCookie, setCookie } from 'nitro/h3'
import type { H3Event } from 'nitro'
import type { AppDb } from '~/server/db'
import { execute, executeBatch, queryAll, queryFirst } from '~/server/db'
import { resolvePublishedTenantPageIdentity as resolveCanonicalTenantPageIdentity } from '~/server/utils/tenant-pages'
import { resolveAttributionTouch, type AttributionParams } from '~/utils/analytics-attribution'
import { publicTemplateRegistry, resolvePublicTemplate } from '~/utils/template-registry'
import type { PublicTemplateDefinition } from '~/utils/template-registry'
import { PLATFORM_SITE_ID } from '~/shared/platform-scope'
export { isTrackablePath, PAGEVIEW_SKIP_PREFIXES } from '~/utils/pageview-path'

export const VISITOR_COOKIE = 'kc_visitor_id'
export const SESSION_COOKIE = 'kc_session_id'
const VISITOR_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2
const SESSION_MAX_AGE_SECONDS = 60 * 30
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const BOT_PATTERN = /bot|crawler|spider|slurp|preview|facebookexternalhit|whatsapp|headlesschrome|lighthouse|pagespeed/i

function analyticsCookie(event: H3Event, name: string, maxAge: number): string {
  const existing = getCookie(event, name)
  const value = existing && UUID_PATTERN.test(existing) ? existing : crypto.randomUUID()
  setCookie(event, name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: event.url.protocol === 'https:',
    path: '/',
    maxAge,
  })
  return value
}

export function getOrCreateVisitorId(event: H3Event): string {
  return analyticsCookie(event, VISITOR_COOKIE, VISITOR_MAX_AGE_SECONDS)
}

export function getOrCreateSessionId(event: H3Event): string {
  return analyticsCookie(event, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS)
}

export function isCanonicalEventId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function isKnownBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent)
}

export async function hashIp(ip: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

interface CloudflareGeo { country?: string; region?: string; city?: string }

export function getCloudflareGeo(event: H3Event): CloudflareGeo {
  const request = (event.req.runtime?.cloudflare as { request?: Request & { cf?: CloudflareGeo } } | undefined)?.request
  if (request?.cf) return request.cf
  const country = event.req.headers.get('cf-ipcountry')
  return country && country !== 'XX' ? { country } : {}
}

export async function resolveLocationIdFromPath(db: AppDb, siteId: string, pagePath: string): Promise<string | null> {
  const slug = pagePath.match(/^\/locations\/([^/]+)/)?.[1]
  if (!slug) return null
  return (await queryFirst<{ id: string }>(db, 'SELECT id FROM business_locations WHERE site_id = ? AND slug = ? LIMIT 1', [siteId, slug]))?.id ?? null
}

export async function resolvePageviewTenantPageIdentity(db: AppDb, siteId: string, pagePath: string, locale?: string | null) {
  return await resolveCanonicalTenantPageIdentity(db, siteId, pagePath, locale)
}

export function isKnownTenantPublicPath(
  pathname: string,
  templateInput?: Parameters<typeof resolvePublicTemplate>[0],
): boolean {
  const templates: PublicTemplateDefinition[] = templateInput
    ? [resolvePublicTemplate(templateInput)]
    : Object.values(publicTemplateRegistry)
  return templates.some(template =>
    template.sitemap.exactPaths.includes(pathname)
    || template.nonIndexableExactPaths.includes(pathname)
    || template.sitemap.dynamicPrefixes.some(prefix => pathname.startsWith(prefix)),
  )
}

export async function getSiteInternalHosts(db: AppDb, siteId: string, currentHost: string): Promise<string[]> {
  const rows = await queryAll<{ domain: string }>(db, `SELECT domain FROM site_domains WHERE site_id = ? AND status = 'active'`, [siteId])
  return [currentHost.toLowerCase(), ...rows.map(row => String(row.domain || '').toLowerCase())]
}

export interface TenantPageviewInput {
  eventId: string
  organizationId: string
  siteId: string
  pagePath: string
  locale: string | null
  referrerHost: string | null
  attribution: AttributionParams
  internalHosts: string[]
  userAgent: string
  ipHash: string
  sessionId: string
  visitorId: string
  country: string | null
  region: string | null
  city: string | null
  locationId: string | null
  pageId: string | null
  pageType: string | null
  recipe: string | null
  now: string
}

export async function recordTenantPageview(db: AppDb, input: TenantPageviewInput): Promise<void> {
  const touch = resolveAttributionTouch(input.attribution, input.referrerHost, input.internalHosts)
  const initial = touch ?? {
    source: 'Direct', medium: '(none)', campaign: null, term: null, content: null, referrerHost: null,
    gclid: null, gbraid: null, wbraid: null, fbclid: null, msclkid: null,
  }
  await executeBatch(db, [
    {
      query: `INSERT OR IGNORE INTO site_pageview_events (
        id, site_id, location_id, page_path, page_id, page_type, recipe, locale, revision_id,
        referrer, user_agent, ip_hash, session_id, visitor_id, duration_seconds, country, region, city, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      params: [
        input.eventId, input.siteId, input.locationId, input.pagePath, input.pageId, input.pageType,
        input.recipe, input.locale, input.referrerHost, input.userAgent, input.ipHash,
        input.sessionId, input.visitorId, input.country, input.region, input.city, input.now,
      ],
    },
    {
      query: `INSERT INTO site_analytics_sessions (
        id, organization_id, site_id, session_id, visitor_id, started_at, last_seen_at, landing_path,
        last_touch_source, last_touch_medium, last_touch_campaign, last_touch_term, last_touch_content,
        last_touch_referrer_host, last_touch_gclid, last_touch_gbraid, last_touch_wbraid,
        last_touch_fbclid, last_touch_msclkid, last_touch_at, created_at, updated_at
      ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE changes() = 1
      ON CONFLICT(site_id, session_id) DO UPDATE SET
        last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at,
        last_touch_source = CASE WHEN excluded.last_touch_at IS NULL THEN site_analytics_sessions.last_touch_source ELSE excluded.last_touch_source END,
        last_touch_medium = CASE WHEN excluded.last_touch_at IS NULL THEN site_analytics_sessions.last_touch_medium ELSE excluded.last_touch_medium END,
        last_touch_campaign = CASE WHEN excluded.last_touch_at IS NULL THEN site_analytics_sessions.last_touch_campaign ELSE excluded.last_touch_campaign END,
        last_touch_term = CASE WHEN excluded.last_touch_at IS NULL THEN site_analytics_sessions.last_touch_term ELSE excluded.last_touch_term END,
        last_touch_content = CASE WHEN excluded.last_touch_at IS NULL THEN site_analytics_sessions.last_touch_content ELSE excluded.last_touch_content END,
        last_touch_referrer_host = CASE WHEN excluded.last_touch_at IS NULL THEN site_analytics_sessions.last_touch_referrer_host ELSE excluded.last_touch_referrer_host END,
        last_touch_gclid = CASE WHEN excluded.last_touch_at IS NULL THEN site_analytics_sessions.last_touch_gclid ELSE excluded.last_touch_gclid END,
        last_touch_gbraid = CASE WHEN excluded.last_touch_at IS NULL THEN site_analytics_sessions.last_touch_gbraid ELSE excluded.last_touch_gbraid END,
        last_touch_wbraid = CASE WHEN excluded.last_touch_at IS NULL THEN site_analytics_sessions.last_touch_wbraid ELSE excluded.last_touch_wbraid END,
        last_touch_fbclid = CASE WHEN excluded.last_touch_at IS NULL THEN site_analytics_sessions.last_touch_fbclid ELSE excluded.last_touch_fbclid END,
        last_touch_msclkid = CASE WHEN excluded.last_touch_at IS NULL THEN site_analytics_sessions.last_touch_msclkid ELSE excluded.last_touch_msclkid END,
        last_touch_at = CASE WHEN excluded.last_touch_at IS NULL THEN site_analytics_sessions.last_touch_at ELSE excluded.last_touch_at END`,
      params: [
        crypto.randomUUID(), input.organizationId, input.siteId, input.sessionId, input.visitorId,
        input.now, input.now, input.pagePath,
        initial.source, initial.medium, initial.campaign, initial.term, initial.content, initial.referrerHost,
        initial.gclid, initial.gbraid, initial.wbraid, initial.fbclid, initial.msclkid,
        touch ? input.now : null, input.now, input.now,
      ],
    },
  ], { operation: 'record tenant analytics pageview' })
}

export async function updateTenantPageviewDuration(db: AppDb, input: {
  eventId: string; siteId: string; sessionId: string; durationSeconds: number; now: string
}): Promise<void> {
  await executeBatch(db, [
    {
      query: `UPDATE site_pageview_events SET duration_seconds = ? WHERE id = ? AND site_id = ? AND session_id = ?`,
      params: [input.durationSeconds, input.eventId, input.siteId, input.sessionId],
    },
    {
      query: `UPDATE site_analytics_sessions SET
        duration_seconds = COALESCE((SELECT SUM(duration_seconds) FROM site_pageview_events WHERE site_id = ? AND session_id = ?), 0),
        last_seen_at = ?, updated_at = ? WHERE site_id = ? AND session_id = ? AND changes() = 1`,
      params: [input.siteId, input.sessionId, input.now, input.now, input.siteId, input.sessionId],
    },
  ], { operation: 'update exact tenant pageview duration' })
}

export async function recordPlatformPageview(db: AppDb, input: {
  eventId: string; pagePath: string; referrerHost: string | null; userAgent: string; ipHash: string;
  sessionId: string; visitorId: string; country: string | null; region: string | null; city: string | null; now: string
}): Promise<void> {
  await execute(db, `INSERT OR IGNORE INTO site_pageview_events (
    id, site_id, page_path, referrer, user_agent, ip_hash, session_id, visitor_id, duration_seconds, country, region, city, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`, [
    input.eventId, PLATFORM_SITE_ID, input.pagePath, input.referrerHost, input.userAgent, input.ipHash,
    input.sessionId, input.visitorId, input.country, input.region, input.city, input.now,
  ])
}

export async function updatePlatformPageviewDuration(db: AppDb, input: {
  eventId: string; sessionId: string; durationSeconds: number
}): Promise<void> {
  await execute(db, `UPDATE site_pageview_events SET duration_seconds = ? WHERE site_id = ? AND id = ? AND session_id = ?`, [
    input.durationSeconds, PLATFORM_SITE_ID, input.eventId, input.sessionId,
  ])
}
