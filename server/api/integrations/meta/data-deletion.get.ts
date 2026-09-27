import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth } from '~/server/utils/auth'
import { verifyOAuthState } from '~/server/utils/encryption'

/**
 * The status URL Meta requires beside a data-deletion request.
 *
 * The confirmation code is the signed token the POST issued, so this reads the
 * Meta user out of it and answers from the live Better Auth accounts rather
 * than from a record of what was claimed. If an account still carries that
 * Meta user, the answer says so instead of reporting a success that did not
 * happen.
 */
export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
  if (!hmacSecret) return jsonResponse({ error: 'Meta integration is not configured' }, { status: 500 })

  const code = event.url.searchParams.get('code')
  if (!code) return jsonResponse({ error: 'A confirmation code is required' }, { status: 400 })

  const payload = await verifyOAuthState<{ metaUserId?: string; timestamp?: number }>(hmacSecret, code)
  const metaUserId = payload?.metaUserId
  if (!metaUserId) return jsonResponse({ error: 'Unknown confirmation code' }, { status: 404 })

  const context = await createAuth(env).$context
  const remaining = await Promise.all((['facebook', 'instagram'] as const).map(providerId =>
    context.internalAdapter.findAccountByKey({ providerId, accountId: metaUserId })))
  const complete = remaining.every(account => !account)
  return jsonResponse({
    confirmation_code: code,
    status: complete ? 'complete' : 'incomplete',
    requested_at: payload?.timestamp ? new Date(payload.timestamp).toISOString() : null,
    description: complete
      ? 'The Meta authorization and everything KrabiClaw imported from it have been deleted.'
      : 'A Meta connection for this account still exists. Contact support@krabiclaw.com.',
  })
})
import { defineHandler } from 'nitro';
