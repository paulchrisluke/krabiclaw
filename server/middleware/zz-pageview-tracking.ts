// Server-side pageview tracking for public tenant pages.
// Named to sort after tenant-resolution.ts and tenant-routing.ts so it only
// runs once event.context.siteId is resolved and any onboarding/canonical-domain
// redirect has already short-circuited the request (h3 skips later middleware
// once a response is sent — see event.handled).
import { defineEventHandler, getHeader, getRequestURL } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import {
  getClientIp,
  getCloudflareGeo,
  getOrCreateSessionId,
  getOrCreateVisitorId,
  hashIp,
  insertPageviewEvent,
  isTrackablePath
} from '~/server/utils/pageview-tracking'

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') return
  if (event.context.tenantType !== 'tenant') return

  const siteId = event.context.siteId
  if (!siteId) return

  const url = getRequestURL(event)
  if (!isTrackablePath(url.pathname)) return

  const env = cloudflareEnv(event)
  const db = env.db
  if (!db) return

  try {
    const visitorId = getOrCreateVisitorId(event)
    const sessionId = getOrCreateSessionId(event)
    const ipHash = await hashIp(getClientIp(event))
    const geo = getCloudflareGeo(event)

    const rawReferrer = getHeader(event, 'referer') || null
    const referrer = rawReferrer ? rawReferrer.slice(0, 2048) : null
    const rawUa = getHeader(event, 'user-agent') || null
    const userAgent = rawUa ? rawUa.slice(0, 1024) : null

    const insertPromise = insertPageviewEvent(db, {
      siteId,
      pagePath: url.pathname,
      referrer,
      userAgent,
      ipHash,
      sessionId,
      visitorId,
      country: geo.country || null,
      region: geo.region || null,
      city: geo.city || null
    })

    const waitUntil = event.context.cloudflare?.context?.waitUntil
    if (waitUntil) {
      waitUntil(insertPromise)
    } else {
      await insertPromise
    }
  } catch (error) {
    // Analytics must never break the public site.
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('SSR pageview tracking failed:', err.message)
  }
})
