import { defineHandler } from 'nitro';
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { verifyOAuthState } from '~/server/utils/encryption'
import { remainingMetaSubjectData } from '~/server/utils/integration-release'

/**
 * The status URL Meta requires beside a data-deletion request. The code names
 * the verified app and person, and the answer comes from what the database
 * still holds for them, not from a record of what was claimed.
 */
export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
  if (!hmacSecret) return jsonResponse({ error: 'Meta integration is not configured' }, { status: 500 })

  const code = event.url.searchParams.get('code')
  if (!code) return jsonResponse({ error: 'A confirmation code is required' }, { status: 400 })

  const payload = await verifyOAuthState<{ channel?: string; providerAppId?: string; providerSubjectId?: string; timestamp?: number }>(hmacSecret, code)
  if (!payload || (payload.channel !== 'facebook' && payload.channel !== 'instagram') || !payload.providerAppId || !payload.providerSubjectId) {
    return jsonResponse({ error: 'Unknown confirmation code' }, { status: 404 })
  }
  const remaining = await remainingMetaSubjectData(env, { channel: payload.channel, providerAppId: payload.providerAppId, providerSubjectId: payload.providerSubjectId })
  return jsonResponse({
    confirmation_code: code,
    status: remaining === 0 ? 'complete' : 'incomplete',
    requested_at: payload.timestamp ? new Date(payload.timestamp).toISOString() : null,
    description: remaining === 0
      ? 'The Meta authorization and everything Krabiclaw imported from it have been deleted.'
      : `${remaining} record(s) from this Meta account remain. Contact support@krabiclaw.com.`,
  })
})
