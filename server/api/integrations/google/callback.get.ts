import { loadMemberOrganizationRow } from '~/server/utils/location-access'
import { assertOrganizationWideAccess, memberAccessPrincipal, resolveUserOrganization } from '~/server/utils/member-access'
import { cloudflareEnv } from '~/server/utils/api-response'
import {
  exchangeGoogleCode, googleUserEmail, storeGoogleCredential, type GoogleProduct,
} from '~/server/utils/google-credential'
import { verifyOAuthState } from '~/server/utils/encryption'

/**
 * One callback for every Google product.
 *
 * Which product the tenant was connecting travels in the signed state, so
 * Analytics and Search Console share a redirect URI — one to register with
 * Google, not one per product — and the credential they share is written the
 * same way whichever of them was being connected.
 *
 * The callback stores the account only. Choosing a GA4 property or a Search
 * Console site is a second, explicit step on the product's own leaf, so an
 * authorization never silently selects a resource on the tenant's behalf.
 */
interface GoogleOAuthState {
  revision: string | null
  product: GoogleProduct
  organizationId: string
  userId: string
  timestamp: number
}

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return new Response('Missing Google OAuth configuration.', { status: 500 })
  }

  const code = event.url.searchParams.get('code')
  const state = event.url.searchParams.get('state')
  if (!code || !state) return new Response(null, { status: 302, headers: { Location: '/dashboard?google=error' } })

  const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
  if (!hmacSecret) return new Response('Server misconfiguration.', { status: 500 })

  const stateData = await verifyOAuthState<GoogleOAuthState>(hmacSecret, state)
  if (!stateData || !(stateData.revision === null || typeof stateData.revision === 'string')) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard?google=error' } })
  }

  const { organizationId, userId, timestamp, product } = stateData
  if (!organizationId || !userId || Date.now() - timestamp > 10 * 60 * 1000) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard?google=expired' } })
  }

  const leaf = product === 'search-console' ? 'google-search-console' : 'google-analytics'
  const organization = await resolveUserOrganization(env, { userId, organizationId })
  const redirectTo = (status: string) => organization
    ? `/dashboard/${encodeURIComponent(organization.slug)}/settings/integrations/${leaf}?google=${status}`
    : `/dashboard?google=${status}`

  try {
    if (!env.DB) throw new Error('Database unavailable')
    // `organizationId` arrives in the OAuth state, so it names an organization
    // rather than proving membership in one. The site row's own membership is
    // what authorizes: the state only has to agree with it.
    const access = await loadMemberOrganizationRow(event, env.DB, env, organizationId, userId)
    if (!access || access.id !== organizationId) throw new Error('Access denied')
    await assertOrganizationWideAccess(env.DB, memberAccessPrincipal(access.membership, { env, event }))

    const token = await exchangeGoogleCode(env, code)
    const email = await googleUserEmail(token.accessToken)

    await storeGoogleCredential(env, {
      organization_id: organizationId,
      connected_by_user_id: userId,
      provider_account_email: email,
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      scopes: token.scope,
      expires_at: new Date(Date.now() + token.expiresIn * 1000).toISOString(),
    }, { revision: stateData.revision })

    return new Response(null, { status: 302, headers: { Location: redirectTo('connected') } })
  } catch (error) {
    console.error('google_oauth_callback_failed', { organizationId, product, error })
    return new Response(null, { status: 302, headers: { Location: redirectTo('error') } })
  }
})
import { defineHandler } from 'nitro';
