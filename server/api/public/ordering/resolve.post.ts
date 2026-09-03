import { defineHandler, HTTPError } from 'nitro'

import { hashOrderingQrCredential, isOrderingQrCredential, resolveOrderingQrCredential } from '~/server/domain/service-points'
import { cloudflareEnv, jsonResponse, readStrictBody } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getClientIp, hashClientIp, HOUR_MS, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'
import { resolveSitePublicOrigin } from '~/server/utils/mcp-executor/shared'

const ORDERING_QR_IP_HOURLY_LIMIT = 60
const ORDERING_QR_CREDENTIAL_HOURLY_LIMIT = 120

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user?.id) throw new HTTPError({ statusCode: 401, statusMessage: 'Authentication required' })

  const body = await readStrictBody<{ credential: string }>(event, { credential: 'string' })
  const ipHash = await hashClientIp(getClientIp(event))
  const ipAllowed = await incrementHourlyRateLimit(env.DB, `ordering-qr:ip:${ipHash}`, ORDERING_QR_IP_HOURLY_LIMIT, HOUR_MS)
  if (!ipAllowed) {
    return jsonResponse({ error: 'Too many Ordering QR attempts' }, { status: 429 })
  }
  if (!isOrderingQrCredential(body.credential)) {
    return jsonResponse({ error: 'Ordering QR code is unavailable' }, { status: 404 })
  }

  const credentialHash = await hashOrderingQrCredential(body.credential)
  const credentialAllowed = await incrementHourlyRateLimit(
    env.DB,
    `ordering-qr:credential:${credentialHash}`,
    ORDERING_QR_CREDENTIAL_HOURLY_LIMIT,
    HOUR_MS,
  )
  if (!credentialAllowed) return jsonResponse({ error: 'Too many Ordering QR attempts' }, { status: 429 })

  const resolution = await resolveOrderingQrCredential(env.DB, body.credential)
  if (!resolution) return jsonResponse({ error: 'Ordering QR code is unavailable' }, { status: 404 })
  const publicOrigin = resolveSitePublicOrigin({
    publicUrl: resolution.sitePublicUrl,
    customDomain: resolution.siteCustomDomain,
    subdomain: resolution.siteSubdomain,
  }, env)
  if (!publicOrigin) throw new HTTPError({ statusCode: 503, statusMessage: 'Site public URL is unavailable' })

  const continueUrl = new URL('/order', publicOrigin)
  continueUrl.searchParams.set('location', resolution.locationSlug)
  continueUrl.searchParams.set('service_point', '1')
  continueUrl.hash = new URLSearchParams({ credential: body.credential }).toString()
  return jsonResponse({
    context: {
      site_id: resolution.siteId,
      site_name: resolution.siteName,
      location_id: resolution.locationId,
      location_slug: resolution.locationSlug,
      location_title: resolution.locationTitle,
      service_point_id: resolution.servicePointId,
      service_point_label: resolution.servicePointLabel,
    },
    continue_url: continueUrl.toString(),
  }, {
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  })
})
