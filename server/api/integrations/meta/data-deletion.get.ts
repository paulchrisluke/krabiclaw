import { queryFirst } from '~/server/db'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { verifyOAuthState } from '~/server/utils/encryption'

/**
 * The status URL Meta requires beside a data-deletion request.
 *
 * The confirmation code is the signed token the POST issued, so this reads the
 * Meta user out of it and answers from the live rows rather than from a record
 * of what was claimed. If anything still carries that Meta user, the answer
 * says so instead of reporting a success that did not happen.
 */
export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
  if (!hmacSecret) return jsonResponse({ error: 'Meta integration is not configured' }, { status: 500 })

  const code = event.url.searchParams.get('code')
  if (!code) return jsonResponse({ error: 'A confirmation code is required' }, { status: 400 })

  const payload = await verifyOAuthState<{ metaUserId?: string; timestamp?: number }>(hmacSecret, code)
  if (!payload?.metaUserId) return jsonResponse({ error: 'Unknown confirmation code' }, { status: 404 })

  const remaining = await queryFirst<{ remaining: number }>(env.DB, `
    SELECT COUNT(*) AS remaining FROM sites
     WHERE json_extract(integrations_json, '$.facebook.facebook_user_id') = ?
        OR json_extract(integrations_json, '$.instagram.instagram_user_id') = ?
  `, [payload.metaUserId, payload.metaUserId])

  const complete = (remaining?.remaining ?? 0) === 0
  return jsonResponse({
    confirmation_code: code,
    status: complete ? 'complete' : 'incomplete',
    requested_at: payload.timestamp ? new Date(payload.timestamp).toISOString() : null,
    description: complete
      ? 'The Meta authorization and everything KrabiClaw imported from it have been deleted.'
      : 'A Meta connection for this account still exists. Contact support@krabiclaw.com.',
  })
})
import { defineHandler } from 'nitro';
