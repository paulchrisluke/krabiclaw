import { jsonResponse } from '~/server/utils/api-response'
import { signOAuthState } from '~/server/utils/encryption'
import { parseMetaSignedRequest } from '~/server/utils/facebook-pages'
import { releaseMetaUserIntegrations } from '~/server/utils/integration-release'

/**
 * Meta's data-deletion callback: a protocol adapter, like the deauthorize one.
 *
 * The difference from deauthorizing is the ask, not the mechanism. This one
 * sets `eraseProviderData`, so the release destroys what was imported from
 * Meta — the synced posts and their images — as well as ending the
 * authorization. Both go through the same release path.
 *
 * It deletes Meta's data, not the customer. A KrabiClaw workspace is deleted
 * through the scheduled deletion in server/utils/tenant-deletion.ts, by its
 * owner, with a grace period; a request from Meta about one person's Instagram
 * account is not that, and must never become that.
 *
 * Meta requires a confirmation code and a status URL. The code is a signed
 * token naming the Meta user, so `GET` below can verify it and re-check the
 * real state rather than reading back a record of its own.
 */
export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const appSecret = env.FACEBOOK_APP_SECRET
  const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
  if (!appSecret || !hmacSecret) {
    return jsonResponse({ error: 'Meta integration is not configured' }, { status: 500 })
  }

  const body = await readBody<{ signed_request?: string }>(event).catch(() => null)
  const signedRequest = body?.signed_request
  if (!signedRequest) return jsonResponse({ error: 'signed_request is required' }, { status: 400 })

  const payload = await parseMetaSignedRequest(signedRequest, appSecret)
  if (!payload?.user_id) return jsonResponse({ error: 'Invalid signed request' }, { status: 401 })

  await releaseMetaUserIntegrations(env, payload.user_id, { eraseProviderData: true })

  const confirmationCode = await signOAuthState(hmacSecret, {
    metaUserId: payload.user_id,
    timestamp: Date.now(),
  })
  const statusUrl = new URL('/api/integrations/meta/data-deletion', event.url.origin)
  statusUrl.searchParams.set('code', confirmationCode)

  return jsonResponse({ url: statusUrl.toString(), confirmation_code: confirmationCode })
})
import { defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
import { cloudflareEnv } from '~/server/utils/api-response';
