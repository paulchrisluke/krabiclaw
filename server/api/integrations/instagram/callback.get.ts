import { defineHandler } from 'nitro'
import type { IntegrationOAuthState } from '~/shared/organization-settings'
import { cloudflareEnv } from '~/server/utils/api-response'
import { verifyOAuthState } from '~/server/utils/encryption'
import {
  exchangeForLongLivedInstagramToken, exchangeInstagramCode, getInstagramAccount, storeInstagramConnection,
} from '~/server/utils/instagram'
import { loadMemberOrganizationRow } from '~/server/utils/location-access'
import { assertOrganizationWideAccess, memberAccessPrincipal, resolveUserOrganization } from '~/server/utils/member-access'

/**
 * Where Instagram Login returns. The code becomes a sixty-day token for the
 * professional account the person signed in with, and that account is the
 * Instagram connection — there is nothing to choose, so nothing waits.
 */
export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
  if (!hmacSecret) return new Response('Server misconfiguration.', { status: 500 })

  const code = event.url.searchParams.get('code')
  const state = event.url.searchParams.get('state')
  if (!state) return new Response(null, { status: 302, headers: { Location: '/dashboard?instagram=error' } })

  const stateData = await verifyOAuthState<IntegrationOAuthState>(hmacSecret, state)
  if (!stateData || !(stateData.revision === null || typeof stateData.revision === 'string')
    || Date.now() - stateData.timestamp > 10 * 60 * 1000) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard?instagram=expired' } })
  }

  const { organizationId, userId } = stateData
  const organization = await resolveUserOrganization(env, { userId, organizationId })
  const leaf = organization
    ? `/dashboard/${encodeURIComponent(organization.slug)}/settings/integrations/instagram`
    : '/dashboard'
  const redirect = (status: string) => new Response(null, { status: 302, headers: { Location: `${leaf}?instagram=${status}` } })

  if (event.url.searchParams.get('error')) return redirect('denied')
  if (!code) return redirect('error')

  try {
    // `organizationId` arrives in the OAuth state, so it names an organization
    // rather than proving membership in one. The membership is what authorizes.
    const access = await loadMemberOrganizationRow(event, env.DB, env, organizationId, userId)
    if (!access || access.id !== organizationId) throw new Error('Access denied')
    await assertOrganizationWideAccess(env.DB, memberAccessPrincipal(access.membership, { env, event }))

    const shortLived = await exchangeInstagramCode(env, code)
    const longLived = await exchangeForLongLivedInstagramToken(env, shortLived.accessToken)
    const account = await getInstagramAccount(longLived.accessToken)

    await storeInstagramConnection(env, {
      organization_id: organizationId,
      connected_by_user_id: userId,
      instagram_user_id: account.id,
      scoped_user_id: shortLived.instagramUserId,
      username: account.username,
      access_token: longLived.accessToken,
      token_expires_at: longLived.expiresAt,
    }, { revision: stateData.revision })
    return redirect('connected')
  } catch (error) {
    console.error('instagram_oauth_callback_failed', { organizationId, error: error instanceof Error ? error.message : String(error) })
    return redirect('error')
  }
})
