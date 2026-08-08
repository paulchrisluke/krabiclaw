import { appendResponseHeader, defineEventHandler, getHeaders, readBody } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth, getAuthSession } from '~/server/utils/auth'
import { runSiteCreation, VALID_VERTICALS } from '~/server/utils/site-creation'
import type { SiteVertical } from '~/utils/vertical-copy'

interface SetActiveOrganizationApi {
  setActiveOrganization(_input: {
    body: { organizationId: string }
    headers: HeadersInit
    asResponse: true
  }): Promise<Response>
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string; subdomain?: string; vertical?: string }>(event)
  const name = body?.name?.trim()
  const subdomain = body?.subdomain?.trim()
  const vertical = body?.vertical

  if (!name || !subdomain) {
    return jsonResponse({ error: 'name and subdomain are required' }, { status: 400 })
  }
  if (!vertical || !VALID_VERTICALS.includes(vertical as SiteVertical)) {
    return jsonResponse({
      error: `vertical is required and must be one of: ${VALID_VERTICALS.join(', ')}`
    }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const result = await runSiteCreation(env, db, session.user.id, {
    name,
    subdomain,
    vertical: vertical as SiteVertical
  })
  if (result.status === 200 && 'organizationId' in result.data) {
    const auth = createAuth(env)
    const activeOrganizationApi = auth.api as unknown as SetActiveOrganizationApi
    const response = await activeOrganizationApi.setActiveOrganization({
      body: { organizationId: String(result.data.organizationId) },
      headers: getHeaders(event) as HeadersInit,
      asResponse: true,
    })
    if (!response.ok) {
      return jsonResponse({ error: 'Failed to activate the new organization' }, { status: response.status || 502 })
    }
    const headerBag = response.headers as Headers & {
      getSetCookie?: () => string[]
      getAll?: (_name: string) => string[]
      raw?: () => Record<string, string[]>
    }
    const setCookies = typeof headerBag.getSetCookie === 'function'
      ? headerBag.getSetCookie()
      : typeof headerBag.getAll === 'function'
        ? headerBag.getAll('set-cookie')
        : (headerBag.raw?.()['set-cookie'] || [])
    for (const cookieValue of setCookies) {
      appendResponseHeader(event, 'set-cookie', cookieValue)
    }
  }
  return jsonResponse(result.data, { status: result.status })
})
