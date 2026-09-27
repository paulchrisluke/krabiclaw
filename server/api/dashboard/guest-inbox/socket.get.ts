import { HTTPError, defineHandler } from 'nitro'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { isOrganizationWideRole } from '~/server/utils/member-access'

export default defineHandler(async (event) => {
  const { env, organization, userId } = await getDashboardContext(event, {})
  if (!isOrganizationWideRole(organization.role)) {
    throw new HTTPError({ statusCode: 403, message: 'Dashboard realtime access denied' })
  }

  const namespace = env.GUEST_INBOX_HUBS
  if (!namespace) throw new HTTPError({ statusCode: 503, message: 'Dashboard realtime binding is not configured' })

  const headers = new Headers(event.req.headers)
  headers.set('x-krabiclaw-organization-id', organization.id)
  headers.set('x-krabiclaw-user-id', userId)

  // URL and init rather than a Request: Wrangler's platform proxy stub for a
  // Durable Object (nuxt dev) stringifies a Request it is handed, and the
  // upgrade failed with "Failed to parse URL from [object Request]".
  const response = await namespace.get(namespace.idFromName(organization.id)).fetch(event.req.url, {
    method: event.req.method,
    headers,
  })
  return response.status === 101 ? response : new Response(response.body, response)
})
