import type { IntegrationOAuthState } from '~/shared/site-settings'
import { defineHandler } from 'nitro';
import { cloudflareEnv } from '../../../utils/api-response'
import { verifyOAuthState } from '../../../utils/encryption'
import {
  exchangeFacebookCode, getFacebookUserInfo, getFacebookPages, storeFacebookPagesConnection, storePendingPageSelection, } from '../../../utils/facebook-pages'
import { loadMemberOrganizationRow } from '~/server/utils/location-access'
import { assertOrganizationWideAccess, memberAccessPrincipal, resolveUserOrganization } from '~/server/utils/member-access'

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
  const organization = await resolveUserOrganization(env, { userId, organizationId })
  const leaf = organization
    ? `/dashboard/${encodeURIComponent(organization.slug)}/settings/integrations/facebook`
    : '/dashboard'
  const settingsRedirect = (status: string) => `${leaf}?fb=${status}`

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
      return new Response(null, { status: 302, headers: { Location: settingsRedirect('no_pages') } })
    }

    // More than one Page is a question only the tenant can answer. Taking
    // pages[0] connected whichever Page Facebook happened to list first, which
    // for an agency account is rarely the one they meant.
    if (pages.length > 1) {
      const handle = await storePendingPageSelection(env, {
        organizationId, userId,
        facebookUserId: userInfo.id,
        userToken: systemUserToken,
        revision: stateData.revision,
        pages,
      })
      return new Response(null, {
        status: 302,
        headers: { Location: `${settingsRedirect('select_page')}&handle=${encodeURIComponent(handle)}` },
      })
    }

    const onlyPage = pages[0]!

    await storeFacebookPagesConnection(env, {
      organization_id: organizationId, connected_by_user_id: userId,
      facebook_user_id: userInfo.id, page_id: onlyPage.id, page_name: onlyPage.name,
      encrypted_user_token: systemUserToken, encrypted_page_token: onlyPage.access_token,
      user_token_expires_at: undefined, scopes: undefined, status: 'active',
    }, stateData)

    return new Response(null, {
      status: 302, headers: { Location: settingsRedirect('connected') }, })
  } catch (err) {
    console.error('Facebook OAuth callback failed:', err)
    return new Response(null, { status: 302, headers: { Location: settingsRedirect('error') } })
  }
})
