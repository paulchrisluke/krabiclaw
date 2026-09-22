import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { parseMetaSignedRequest } from '~/server/utils/facebook-pages'
import { releaseMetaUserIntegrations } from '~/server/utils/integration-release'

/**
 * Meta's deauthorize callback: a protocol adapter and nothing else.
 *
 * Meta posts a signed request when someone removes KrabiClaw from their
 * Facebook or Instagram settings. Verifying that signature is the whole
 * authorization check — there is no session here — and what follows is the
 * same release the dashboard's Disconnect performs, so there is one definition
 * of what disconnecting means.
 *
 * Deauthorizing ends the integration, not the customer's website: the posts
 * already imported stay, exactly as they would if the tenant had pressed
 * Disconnect. Erasing those is the data-deletion callback's ask, not this one.
 */
export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const appSecret = env.FACEBOOK_APP_SECRET
  if (!appSecret) return jsonResponse({ error: 'Meta integration is not configured' }, { status: 500 })

  const body = await readBody<{ signed_request?: string }>(event).catch(() => null)
  const signedRequest = body?.signed_request
  if (!signedRequest) return jsonResponse({ error: 'signed_request is required' }, { status: 400 })

  const payload = await parseMetaSignedRequest(signedRequest, appSecret)
  if (!payload?.user_id) return jsonResponse({ error: 'Invalid signed request' }, { status: 401 })

  const results = await releaseMetaUserIntegrations(env, payload.user_id)

  return jsonResponse({ success: true, released: results.filter(result => result.released).length })
})
import { defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
