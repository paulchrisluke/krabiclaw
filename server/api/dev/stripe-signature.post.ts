import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { timingSafeEqualText } from '~/server/utils/dev-route-auth'
import { HTTPError, defineHandler  } from 'nitro';
import {  readBody  } from 'nitro/h3';

const textEncoder = new TextEncoder()

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const devMode = import.meta.dev
  const e2eOverride = env.E2E_ALLOW_DEV_ROUTES === 'true'
  if (!devMode && !e2eOverride) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Not found' })
  }

  if (!devMode && e2eOverride) {
    const expectedSecret = env.E2E_DEV_ROUTE_SECRET || ''
    const providedSecret = (event.req.headers.get('x-dev-route-secret')) || ''
    if (!expectedSecret || !providedSecret || !timingSafeEqualText(providedSecret, expectedSecret)) {
      throw new HTTPError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    return jsonResponse({ error: 'Stripe webhook secret not configured' }, { status: 503 })
  }

  const body = await readBody(event).catch(() => null) as { payload?: string; timestamp?: number } | null
  const payload = typeof body?.payload === 'string' ? body.payload : ''
  const timestamp = Number.isFinite(body?.timestamp) ? Number(body?.timestamp) : Math.floor(Date.now() / 1000)

  if (!payload) {
    return jsonResponse({ error: 'payload is required' }, { status: 400 })
  }

  const signedPayload = `${timestamp}.${payload}`
  const digest = await hmacHex(env.STRIPE_WEBHOOK_SECRET, signedPayload)
  return jsonResponse({
    signature: `t=${timestamp},v1=${digest}`,
    timestamp,
  })
})
