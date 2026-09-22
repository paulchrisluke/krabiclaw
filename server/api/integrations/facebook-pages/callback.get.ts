import type { IntegrationOAuthState } from '~/shared/site-settings'
import { defineHandler } from 'nitro';
import { cloudflareEnv } from '../../../utils/api-response'
import { verifyOAuthState } from '../../../utils/encryption'
import {
  exchangeFacebookCode, getFacebookUserInfo, getFacebookPages, storeFacebookPagesConnection, } from '../../../utils/facebook-pages'
import { getDashboardSiteRouteContext } from '~/server/utils/dashboard-redirects'
import { loadMemberOrganizationRow } from '~/server/utils/location-access'
import { assertOrganizationWideAccess, memberAccessPrincipal } from '~/server/utils/member-access'

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event)

  if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET) {
    return new Response('Missing Facebook OAuth configuration', { status: 500 })
  }

  const url = event.url
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

  const stateData = await verifyOAuthState<IntegrationOAuthState>(hmacSecret, state)

  if (!stateData || !(stateData.revision === null || typeof stateData.revision === 'string') || Date.now() - stateData.timestamp > 10 * 60 * 1000) {
    return new Response(null, { status: 302, headers: { Location: '/dashboard?fb=expired' } })
  }

  const { organizationId, userId } = stateData
  const settingsRedirect = async (status: string) => {
    try {
      const db = env.DB
      if (!db) return `/dashboard?fb=${status}`
      const context = await getDashboardSiteRouteContext(db, env, userId, organizationId)
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
    // `organizationId` arrives in the OAuth state, so it names an organization
    // rather than proving membership in one. The site row's own membership is
    // what authorizes: the state only has to agree with it.
    const siteAccess = await loadMemberOrganizationRow(event, db, env, organizationId, userId)
    if (!siteAccess || siteAccess.id !== organizationId) throw new Error('Access denied')
    await assertOrganizationWideAccess(db, memberAccessPrincipal(siteAccess.membership, { env, event }))

    // System-user access tokens from FLB never expire — no long-lived exchange needed
    const systemUserToken = await exchangeFacebookCode(env, code)
    const userInfo = await getFacebookUserInfo(systemUserToken)
    const pages = await getFacebookPages(systemUserToken)

    if (pages.length === 0) {
      return new Response(null, { status: 302, headers: { Location: await settingsRedirect('no_pages') } })
    }

    const firstPage = pages[0]
    if (!firstPage) {
      return new Response(null, { status: 302, headers: { Location: await settingsRedirect('no_pages') } })
    }

    await storeFacebookPagesConnection(env, {
      organization_id: organizationId, connected_by_user_id: userId, facebook_user_id: userInfo.id, page_id: firstPage.id, page_name: firstPage.name, encrypted_user_token: systemUserToken, encrypted_page_token: firstPage?.access_token, user_token_expires_at: undefined, scopes: undefined, status: 'active', }, stateData)

    return new Response(null, {
      status: 302, headers: { Location: await settingsRedirect('connected') }, })
  } catch (err) {
    console.error('Facebook OAuth callback failed:', err)
    return new Response(null, { status: 302, headers: { Location: await settingsRedirect('error') } })
  }
})
