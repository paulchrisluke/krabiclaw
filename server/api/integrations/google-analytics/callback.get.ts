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

    let organization: { slug: string | null } | null = null
    try {
      organization = (await queryFirst<{ slug: string | null }>(db, `SELECT slug FROM organization WHERE id = ? LIMIT 1`, [organizationId])) ?? null
    } catch (e) {
      console.error('Google Analytics redirect organization query failed:', e)
      return `/dashboard?ga=${status}`
    }

    if (!organization?.slug) return `/dashboard?ga=${status}`
    const encodedOrgSlug = encodeURIComponent(organization.slug)
    return `/dashboard/${encodedOrgSlug}/settings/analytics?ga=${status}`
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
