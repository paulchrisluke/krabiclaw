import { defineHandler } from 'nitro';
import { readBody } from 'nitro/h3';
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { signOAuthState } from '~/server/utils/encryption'
import { eraseMetaSubjectData } from '~/server/utils/integration-release'
import { configuredMetaApps, verifyMetaSignedRequest } from '~/server/utils/meta-graph'

/**
 * Meta's data-deletion callback.
 *
 * It erases what Krabiclaw imported from one verified Meta person in one Meta
 * app — the posts and media synced from their Page or account — wherever it
 * went, through the provenance each import recorded, even after the connection
 * and the linked account are gone. The tenant's own posts, including ones
 * published to that Page, stay; only their link to it goes.
 *
 * It deletes Meta's data, not the customer. A Krabiclaw workspace is deleted
 * by its owner through Better Auth's organization deletion; a request from
 * Meta about one person's Instagram account is not that, and must never
 * become that.
 *
 * The confirmation code is a signed token naming the verified app and
 * subject, so the status URL re-checks the real remaining state. A cleanup
 * that fails answers 500, and Meta's retry resumes it.
 */
export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const apps = configuredMetaApps(env)
  const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
  if (!apps.length || !hmacSecret) return jsonResponse({ error: 'Meta integration is not configured' }, { status: 500 })

  const body = await readBody<{ signed_request?: string }>(event).catch(() => null)
  const signedRequest = body?.signed_request
  if (!signedRequest) return jsonResponse({ error: 'signed_request is required' }, { status: 400 })

  const subject = await verifyMetaSignedRequest(signedRequest, apps)
  if (!subject) return jsonResponse({ error: 'Invalid signed request' }, { status: 401 })

  const erased = await eraseMetaSubjectData(env, subject)
  const confirmationCode = await signOAuthState(hmacSecret, {
    channel: subject.channel, providerAppId: subject.providerAppId, providerSubjectId: subject.providerSubjectId, timestamp: Date.now(),
  })
  const statusUrl = new URL('/api/integrations/meta/data-deletion', event.url.origin)
  statusUrl.searchParams.set('code', confirmationCode)
  return jsonResponse({ url: statusUrl.toString(), confirmation_code: confirmationCode, ...erased })
})
