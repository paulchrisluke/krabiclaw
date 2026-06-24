import { cloudflareEnv } from '../../../utils/api-response'
import { exchangeGoogleBusinessCode, storeGoogleBusinessConnection } from '../../../utils/google-business'
import { verifyOAuthState } from '../../../utils/encryption'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)

  if (!env.GOOGLE_BUSINESS_CLIENT_ID || !env.GOOGLE_BUSINESS_CLIENT_SECRET) {
    return new Response('Missing Google Business OAuth configuration.', { status: 500 })
  }

  const url = getRequestURL(event)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard?gb=error' } })
  }

  const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
  if (!hmacSecret) {
    return new Response('Server misconfiguration.', { status: 500 })
  }
  const stateData = await verifyOAuthState<{ siteId: string; organizationId: string; userId: string; locationId?: string; timestamp: number }>(hmacSecret, state)
  if (!stateData) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard?gb=error' } })
  }

  const { siteId, organizationId, userId, locationId, timestamp } = stateData

  if (!siteId || !organizationId || !userId || Date.now() - timestamp > 10 * 60 * 1000) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard?gb=expired' } })
  }

  const connectionRedirect = async (status: string) => {
    const db = env.DB
    if (!db) return `/dashboard?gb=${status}`

    let organization: { slug: string | null } | null = null
    try {
      organization = (await queryFirst<{ slug: string | null }>(db, `
        SELECT slug FROM organization WHERE id = ? LIMIT 1
      `, [organizationId])) ?? null
    } catch (e) {
      console.error('Google Business redirect organization query failed:', e)
      return `/dashboard?gb=${status}`
    }

    if (!organization?.slug) return `/dashboard?gb=${status}`
    const encodedOrgSlug = encodeURIComponent(organization.slug)

    let site: { subdomain: string | null } | null = null
    try {
      site = (await queryFirst<{ subdomain: string | null }>(db, `SELECT subdomain FROM sites WHERE id = ? LIMIT 1`, [siteId])) ?? null
    } catch (e) {
      console.error('Google Business redirect site query failed:', e)
      return `/dashboard/${encodedOrgSlug}?gb=${status}`
    }
    if (!site?.subdomain) return `/dashboard/${encodedOrgSlug}?gb=${status}`
    const siteBase = `/dashboard/${encodedOrgSlug}/sites/${encodeURIComponent(site.subdomain)}`
    if (!locationId) return `${siteBase}?gb=${status}`

    try {
      const location = await queryFirst<{ slug: string }>(db, `
        SELECT slug FROM business_locations
        WHERE id = ? AND organization_id = ? AND site_id = ?
        LIMIT 1
      `, [locationId, organizationId, siteId])
      return location?.slug
        ? `${siteBase}/${encodeURIComponent(location.slug)}?gb=${status}`
        : `${siteBase}?gb=${status}`
    } catch (e) {
      console.error('Google Business redirect location query failed:', e)
      return `${siteBase}?gb=${status}`
    }
  }

  try {
    const tokenData = await exchangeGoogleBusinessCode(env, code)

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

    await storeGoogleBusinessConnection(env, {
      organization_id: organizationId,
      site_id: siteId,
      location_id: locationId,
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
    console.error('Google Business OAuth callback failed:', error)
    return new Response(null, { status: 302, headers: { Location: await connectionRedirect('error') } })
  }
})
