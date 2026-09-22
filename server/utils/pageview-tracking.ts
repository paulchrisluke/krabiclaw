import { getCookie, setCookie } from 'nitro/h3'
import type { H3Event } from 'nitro'
import type { AppDb } from '~/server/db'
import { execute, executeBatch, queryAll, queryFirst } from '~/server/db'
import { resolvePublishedTenantPageIdentity as resolveCanonicalTenantPageIdentity } from '~/server/utils/content/pages'
import { resolveAttributionTouch, type AttributionParams } from '~/utils/analytics-attribution'
import { publicTemplateRegistry, resolvePublicTemplate } from '~/utils/template-registry'
import type { PublicTemplateDefinition } from '~/utils/template-registry'
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

export async function resolveLocationIdFromPath(db: AppDb, organizationId: string, pagePath: string): Promise<string | null> {
  const slug = pagePath.match(/^\/locations\/([^/]+)/)?.[1]
  if (!slug) return null
  return (await queryFirst<{ id: string }>(db, 'SELECT id FROM business_locations WHERE organization_id = ? AND slug = ? LIMIT 1', [organizationId, slug]))?.id ?? null
}

export async function resolvePageviewTenantPageIdentity(db: AppDb, organizationId: string, pagePath: string, locale?: string | null) {
  return await resolveCanonicalTenantPageIdentity(db, organizationId, pagePath, locale)
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

export async function getSiteInternalHosts(db: AppDb, organizationId: string, currentHost: string): Promise<string[]> {
  const rows = await queryAll<{ domain: string }>(db, `SELECT domain FROM organization_domains WHERE organization_id = ? AND status = 'active'`, [organizationId])
  return [currentHost.toLowerCase(), ...rows.map(row => String(row.domain || '').toLowerCase())]
}

export interface TenantPageviewInput {
  eventId: string
  organizationId: string
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
      query: `INSERT OR IGNORE INTO analytics_events (
        id, kind, organization_id, location_id, page_path, session_id, visitor_id, payload_json, created_at
      ) VALUES (?, 'pageview', ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        input.eventId, input.organizationId, input.locationId, input.pagePath, input.sessionId, input.visitorId,
        JSON.stringify({ page_id: input.pageId, page_type: input.pageType, recipe: input.recipe,
          locale: input.locale, revision_id: null, referrer: input.referrerHost, user_agent: input.userAgent,
          ip_hash: input.ipHash, country: input.country, region: input.region, city: input.city }), input.now,
      ],
    },
    {
      query: `INSERT INTO analytics_summaries (
        id, kind, organization_id, date, key, payload_json, created_at, updated_at
      ) SELECT ?, 'session', ?, '', ?, ?, ?, ?
        WHERE changes() = 1
      ON CONFLICT(organization_id, kind, date, key) DO UPDATE SET updated_at = excluded.updated_at,
        payload_json = json_set(analytics_summaries.payload_json,
          '$.last_seen_at', json_extract(excluded.payload_json, '$.last_seen_at'),
          '$.attribution', CASE WHEN json_extract(excluded.payload_json, '$.last_touch_at') IS NULL
            THEN json_extract(analytics_summaries.payload_json, '$.attribution') ELSE json_extract(excluded.payload_json, '$.attribution') END,
          '$.last_touch_at', COALESCE(json_extract(excluded.payload_json, '$.last_touch_at'), json_extract(analytics_summaries.payload_json, '$.last_touch_at')))`,
      params: [
        crypto.randomUUID(), input.organizationId, input.sessionId,
        JSON.stringify({ visitor_id: input.visitorId, started_at: input.now, last_seen_at: input.now,
          landing_path: input.pagePath, duration_seconds: 0, attribution: initial, last_touch_at: touch ? input.now : null }),
        input.now, input.now,
      ],
    },
  ], { operation: 'record tenant analytics pageview' })
}

export async function updateTenantPageviewDuration(db: AppDb, input: {
  eventId: string; organizationId: string; sessionId: string; durationSeconds: number; now: string
}): Promise<void> {
  await executeBatch(db, [
    {
      query: `UPDATE analytics_events SET duration_seconds = ? WHERE kind = 'pageview' AND id = ? AND organization_id = ? AND session_id = ?`,
      params: [input.durationSeconds, input.eventId, input.organizationId, input.sessionId],
    },
    {
      query: `UPDATE analytics_summaries SET payload_json = json_set(payload_json,
        '$.duration_seconds', COALESCE((SELECT SUM(duration_seconds) FROM analytics_events WHERE kind = 'pageview' AND organization_id = ? AND session_id = ?), 0),
        '$.last_seen_at', ?), updated_at = ? WHERE kind = 'session' AND organization_id = ? AND key = ? AND changes() = 1`,
      params: [input.organizationId, input.sessionId, input.now, input.now, input.organizationId, input.sessionId],
    },
  ], { operation: 'update exact tenant pageview duration' })
}

export async function recordPlatformPageview(db: AppDb, input: {
  eventId: string; organizationId: string; pagePath: string; referrerHost: string | null; userAgent: string; ipHash: string;
  sessionId: string; visitorId: string; country: string | null; region: string | null; city: string | null; now: string
}): Promise<void> {
  await execute(db, `INSERT OR IGNORE INTO analytics_events (
    id, kind, organization_id, page_path, session_id, visitor_id, payload_json, created_at
  ) VALUES (?, 'pageview', ?, ?, ?, ?, ?, ?)`, [
    input.eventId, input.organizationId, input.pagePath, input.sessionId, input.visitorId,
    JSON.stringify({ referrer: input.referrerHost, user_agent: input.userAgent, ip_hash: input.ipHash,
      country: input.country, region: input.region, city: input.city }), input.now,
  ])
}

export async function updatePlatformPageviewDuration(db: AppDb, input: {
  eventId: string; organizationId: string; sessionId: string; durationSeconds: number
}): Promise<void> {
  await execute(db, `UPDATE analytics_events SET duration_seconds = ? WHERE kind = 'pageview' AND organization_id = ? AND id = ? AND session_id = ?`, [
    input.durationSeconds, input.organizationId, input.eventId, input.sessionId,
  ])
}
