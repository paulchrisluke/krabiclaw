// PATCH /api/user/notification-preferences — set one category for the
// signed-in account.
//
// One category per request, because the settings leaf edits one category. The
// body is rejected rather than coerced: account_security email is not a
// switchable value, and a request that tries to turn it off is a bug in the
// caller, not a preference to honour.

import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getNotificationPreferences, setNotificationPreference } from '~/server/domain/notification-preferences'
import { isMandatoryEmailCategory, isNotificationCategory } from '~/shared/notification-categories'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event) as { category?: unknown; email?: unknown; whatsapp?: unknown }
  if (!isNotificationCategory(body.category)) {
    return jsonResponse({ error: 'A known notification category is required' }, { status: 400 })
  }
  if (typeof body.email !== 'boolean' || typeof body.whatsapp !== 'boolean') {
    return jsonResponse({ error: 'email and whatsapp must both be booleans' }, { status: 400 })
  }
  if (isMandatoryEmailCategory(body.category) && !body.email) {
    return jsonResponse({ error: `${body.category} email cannot be switched off` }, { status: 400 })
  }

  await setNotificationPreference(db, session.user.id, body.category, { email: body.email, whatsapp: body.whatsapp })
  return jsonResponse({ preferences: await getNotificationPreferences(db, session.user.id) })
})
import { defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
