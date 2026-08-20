// Read-only provider health check for the daily prod canary.
// Confirms WhatsApp + Resend credentials are live without sending a real message/email.
import { defineHandler, HTTPError } from 'nitro';

import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { timingSafeEqualText } from '~/server/utils/dev-route-auth'
import { getWhatsAppProviderStatus, getResendProviderStatus } from '~/server/utils/provider-status'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const expectedSecret = env.CANARY_STATUS_SECRET || ''
  const providedSecret = (event.req.headers.get('x-canary-secret')) || ''
  if (!expectedSecret || !providedSecret || !timingSafeEqualText(providedSecret, expectedSecret)) {
    throw new HTTPError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const [whatsapp, resend] = await Promise.all([
    getWhatsAppProviderStatus(env), getResendProviderStatus(env), ])

  const ok = whatsapp.ok && resend.ok
  return jsonResponse({ ok, whatsapp, resend }, { status: ok ? 200 : 503 })
})
