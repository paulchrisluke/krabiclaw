// POST /api/public/notifications/unsubscribe — one-click opt-out from an email.
//
// Public by design: the request carries no session, because it arrives from a
// mail client acting on the RFC 8058 List-Unsubscribe header or from someone
// opening the footer link on a device they are not signed in on. The HMAC over
// (user, category) is what proves the request came from a message we sent.

import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getNotificationPreferences, setNotificationPreference } from '~/server/domain/notification-preferences'
import { parseUnsubscribeTarget, verifyUnsubscribeToken } from '~/server/utils/unsubscribe'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  if (!env.EMAIL_REPLY_SECRET) return jsonResponse({ error: 'Unsubscribe is not configured' }, { status: 503 })

  const body = await readBody(event) as { user?: unknown; category?: unknown; token?: unknown }
  const target = parseUnsubscribeTarget(body)
  const token = typeof body.token === 'string' ? body.token : ''
  if (!target || !token) return jsonResponse({ error: 'This unsubscribe link is not valid' }, { status: 400 })
  if (!(await verifyUnsubscribeToken(env.EMAIL_REPLY_SECRET, target, token))) {
    return jsonResponse({ error: 'This unsubscribe link is not valid' }, { status: 403 })
  }

  // Unsubscribing silences the email, not the whole category: an owner who
  // still wants the WhatsApp alert keeps it.
  const current = await getNotificationPreferences(db, target.userId)
  await setNotificationPreference(db, target.userId, target.category, {
    email: false,
    whatsapp: current[target.category].whatsapp,
  })
  return jsonResponse({ success: true, category: target.category })
})
import { defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
