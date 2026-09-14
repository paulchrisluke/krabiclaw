// POST /api/public/notifications/unsubscribe?user=&category=&token=
//
// Public by design: the request carries no session, because it arrives either
// from a mail client acting on the RFC 8058 List-Unsubscribe header or from
// someone opening the footer link on a device they are not signed in on. The
// HMAC over (user, category) is what proves the request came from a message we
// sent.
//
// The signed target is read from the query, not the body: a one-click
// unsubscribe POSTs the fixed body `List-Unsubscribe=One-Click` and nothing
// else, so the URL is the only place the target can travel.

import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { disableCategoryEmail } from '~/server/domain/notification-preferences'
import { parseUnsubscribeTarget, verifyUnsubscribeToken } from '~/server/utils/unsubscribe'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })
  if (!env.EMAIL_REPLY_SECRET) return jsonResponse({ error: 'Unsubscribe is not configured' }, { status: 503 })

  const query = getQuery(event)
  const target = parseUnsubscribeTarget(query)
  const token = typeof query.token === 'string' ? query.token : ''
  if (!target || !token) return jsonResponse({ error: 'This unsubscribe link is not valid' }, { status: 400 })
  if (!(await verifyUnsubscribeToken(env.EMAIL_REPLY_SECRET, target, token))) {
    return jsonResponse({ error: 'This unsubscribe link is not valid' }, { status: 403 })
  }

  // Unsubscribing silences the email, not the whole category: an owner who
  // still wants the WhatsApp alert keeps it. Written as one statement rather
  // than read-then-write, so a settings save landing in between is not undone.
  await disableCategoryEmail(db, target.userId, target.category)
  return jsonResponse({ success: true, category: target.category })
})
import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';
