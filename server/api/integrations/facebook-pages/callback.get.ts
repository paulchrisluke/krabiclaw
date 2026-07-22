import { cloudflareEnv } from '../../../utils/api-response'
import { verifyOAuthState } from '../../../utils/encryption'
import {
  exchangeFacebookCode,
  getFacebookUserInfo,
  getFacebookPages,
  storeFacebookPagesConnection,
} from '../../../utils/facebook-pages'
import { getDashboardSiteRouteContext } from '~/server/utils/dashboard-redirects'
import { loadMemberSiteRow } from '~/server/utils/location-access'
import { assertSiteWideAccess } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)

  if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET) {
    return new Response('Missing Facebook OAuth configuration', { status: 500 })
  }

  const url = getRequestURL(event)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard?fb=denied' } })
  }

  if (!code || !state) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard?fb=error' } })
  }

  const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
  if (!hmacSecret) {
    return new Response('Server misconfiguration', { status: 500 })
  }

  const stateData = await verifyOAuthState<{
    siteId: string
    organizationId: string
    userId: string
    timestamp: number
  }>(hmacSecret, state)

  if (!stateData || Date.now() - stateData.timestamp > 10 * 60 * 1000) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard?fb=expired' } })
  }

  const { siteId, organizationId, userId } = stateData
  const settingsRedirect = async (status: string) => {
    try {
      const db = env.DB
      if (!db) return `/dashboard?fb=${status}`
      const context = await getDashboardSiteRouteContext(db, organizationId, siteId)
      return context
        ? `/dashboard/${encodeURIComponent(context.organizationSlug)}/sites/${encodeURIComponent(context.siteSlug)}/settings?fb=${status}`
        : `/dashboard?fb=${status}`
    } catch (e) {
      console.error('Facebook Pages redirect organization query failed:', e)
      return `/dashboard?fb=${status}`
    }
  }

  try {
    const db = env.DB
    if (!db) throw new Error('Database not available')
    const siteAccess = await loadMemberSiteRow(db, siteId, userId)
    if (!siteAccess || siteAccess.organization_id !== organizationId) throw new Error('Access denied')
    await assertSiteWideAccess(db, {
      memberId: siteAccess.member_id,
      role: siteAccess.member_role,
      organizationId,
      siteId,
    })

    // System-user access tokens from FLB never expire — no long-lived exchange needed
    const systemUserToken = await exchangeFacebookCode(env, code)
    const userInfo = await getFacebookUserInfo(systemUserToken)
    const pages = await getFacebookPages(systemUserToken)

    if (pages.length === 0) {
      return new Response(null, { status: 302, headers: { Location: await settingsRedirect('no_pages') } })
    }

    const firstPage = pages[0]

    await storeFacebookPagesConnection(env, {
      organization_id: organizationId,
      site_id: siteId,
      connected_by_user_id: userId,
      facebook_user_id: userInfo.id,
      facebook_page_id: firstPage?.id,
      facebook_page_name: firstPage?.name,
      encrypted_user_token: systemUserToken,
      encrypted_page_token: firstPage?.access_token,
      user_token_expires_at: undefined,
      scopes: undefined,
      status: 'active',
    })

    return new Response(null, {
      status: 302,
      headers: { Location: await settingsRedirect('connected') },
    })
  } catch (err) {
    console.error('Facebook OAuth callback failed:', err)
    return new Response(null, { status: 302, headers: { Location: await settingsRedirect('error') } })
  }
})
