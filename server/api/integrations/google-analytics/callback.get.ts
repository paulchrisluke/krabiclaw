import { cloudflareEnv } from '~/server/utils/api-response'
import { exchangeGoogleAnalyticsCode, storeGoogleAnalyticsConnection } from '~/server/utils/google-analytics'
import { verifyOAuthState } from '~/server/utils/encryption'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return new Response('Missing Google Analytics OAuth configuration.', { status: 500 })
  }

  const url = getRequestURL(event)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard?ga=error' } })
  }

  const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
  if (!hmacSecret) {
    return new Response('Server misconfiguration.', { status: 500 })
  }
  const stateData = await verifyOAuthState<{ siteId: string; organizationId: string; userId: string; timestamp: number }>(hmacSecret, state)
  if (!stateData) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard?ga=error' } })
  }

  const { siteId, organizationId, userId, timestamp } = stateData

  if (!siteId || !organizationId || !userId || Date.now() - timestamp > 10 * 60 * 1000) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard?ga=expired' } })
  }

  const connectionRedirect = async (status: string) => {
    const db = env.DB
    if (!db) return `/dashboard?ga=${status}`

    let context: { organization_slug: string | null; site_slug: string | null } | null = null
    try {
      context = (await queryFirst<{ organization_slug: string | null; site_slug: string | null }>(db, `
        SELECT o.slug AS organization_slug, s.subdomain AS site_slug
        FROM organization o
        JOIN sites s ON s.organization_id = o.id
        WHERE o.id = ? AND s.id = ?
        LIMIT 1
      `, [organizationId, siteId])) ?? null
    } catch (e) {
      console.error('Google Analytics redirect organization query failed:', e)
      return `/dashboard?ga=${status}`
    }

    if (!context?.organization_slug || !context.site_slug) return `/dashboard?ga=${status}`
    const encodedOrgSlug = encodeURIComponent(context.organization_slug)
    const params = new URLSearchParams({ ga: status, site: context.site_slug })
    return `/dashboard/${encodedOrgSlug}/settings/analytics?${params.toString()}`
  }

  try {
    const tokenData = await exchangeGoogleAnalyticsCode(env, code)

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.accessToken}` }
    })
    if (!userInfoResponse.ok) {
      throw new Error(`Failed to fetch user info: ${userInfoResponse.status}`)
    }
    const userInfo = await userInfoResponse.json() as { email?: string }
    if (!userInfo.email) {
      throw new Error('Google user info did not return an email address')
    }

    await storeGoogleAnalyticsConnection(env, {
      organization_id: organizationId,
      site_id: siteId,
      connected_by_user_id: userId,
      provider_account_email: userInfo.email,
      encrypted_access_token: tokenData.accessToken,
      encrypted_refresh_token: tokenData.refreshToken,
      scopes: tokenData.scope,
      expires_at: new Date(Date.now() + tokenData.expiresIn * 1000).toISOString(),
      status: 'active'
    })

    return new Response(null, { status: 302, headers: { Location: await connectionRedirect('connected') } })
  } catch (error) {
    console.error('Google Analytics OAuth callback failed:', error)
    return new Response(null, { status: 302, headers: { Location: await connectionRedirect('error') } })
  }
})
