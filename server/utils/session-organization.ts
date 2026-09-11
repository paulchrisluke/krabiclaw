import type { H3Event } from 'nitro/h3'
import { appendResponseHeader } from 'nitro/h3'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'

interface SetActiveOrganizationApi {
  setActiveOrganization(_input: {
    body: { organizationId: string }
    headers: HeadersInit
    asResponse: true
  }): Promise<Response>
}

// Makes `organizationId` the caller's active organization through Better Auth's
// organization plugin (POST /organization/set-active), forwarding the refreshed
// session cookies onto the current response. Used after a site is created so the
// post-login resolver lands on the organization just acted in.
export async function activateSessionOrganization(event: H3Event, env: CloudflareEnv, organizationId: string): Promise<void> {
  const auth = createAuth(env)
  const activeOrganizationApi = auth.api as unknown as SetActiveOrganizationApi
  const response = await activeOrganizationApi.setActiveOrganization({
    body: { organizationId },
    headers: Object.fromEntries(event.req.headers.entries()) as HeadersInit,
    asResponse: true,
  })
  if (!response.ok) {
    throw new Error(`Failed to activate organization ${organizationId} (${response.status || 502})`)
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
