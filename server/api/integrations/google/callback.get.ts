import { loadMemberSiteRow } from '~/server/utils/location-access'
import { assertSiteWideAccess, memberAccessPrincipal } from '~/server/utils/member-access'
import { cloudflareEnv } from '~/server/utils/api-response'
import {
  exchangeGoogleCode, googleUserEmail, storeGoogleCredential, type GoogleProduct,
} from '~/server/utils/google-credential'
import { verifyOAuthState } from '~/server/utils/encryption'
import { getDashboardSiteRouteContext } from '~/server/utils/dashboard-redirects'

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
  siteId: string
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

  const { siteId, organizationId, userId, timestamp, product } = stateData
  if (!siteId || !organizationId || !userId || Date.now() - timestamp > 10 * 60 * 1000) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard?google=expired' } })
  }

  const leaf = product === 'search-console' ? 'google-search-console' : 'google-analytics'
  const redirectTo = async (status: string) => {
    const db = env.DB
    if (!db) return `/dashboard?google=${status}`
    try {
      const context = await getDashboardSiteRouteContext(db, env, userId, organizationId, siteId)
      if (!context) return `/dashboard?google=${status}`
      return `/dashboard/${encodeURIComponent(context.organizationSlug)}/sites/${encodeURIComponent(context.siteSlug)}/settings/integrations/${leaf}?google=${status}`
    } catch (error) {
      console.error('google_oauth_redirect_lookup_failed', { siteId, error })
      return `/dashboard?google=${status}`
    }
  }

  try {
    if (!env.DB) throw new Error('Database unavailable')
    // `organizationId` arrives in the OAuth state, so it names an organization
    // rather than proving membership in one. The site row's own membership is
    // what authorizes: the state only has to agree with it.
    const access = await loadMemberSiteRow(event, env.DB, env, siteId, userId)
    if (!access || access.organization_id !== organizationId) throw new Error('Access denied')
    await assertSiteWideAccess(env.DB, memberAccessPrincipal(access.membership, { env, siteId, event }))

    const token = await exchangeGoogleCode(env, code)
    const email = await googleUserEmail(token.accessToken)

    await storeGoogleCredential(env, {
      organization_id: organizationId,
      site_id: siteId,
      connected_by_user_id: userId,
      provider_account_email: email,
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      scopes: token.scope,
      expires_at: new Date(Date.now() + token.expiresIn * 1000).toISOString(),
    }, { revision: stateData.revision })

    return new Response(null, { status: 302, headers: { Location: await redirectTo('connected') } })
  } catch (error) {
    console.error('google_oauth_callback_failed', { siteId, product, error })
    return new Response(null, { status: 302, headers: { Location: await redirectTo('error') } })
  }
})
import { defineHandler } from 'nitro';
