import { jsonResponse } from '~/server/utils/api-response'
import { getFacebookPagesConnection, readPendingPageSelection } from '~/server/utils/facebook-pages'
import { requireOrganizationAccess } from '~/server/utils/location-access'

/**
 * The Facebook leaf: the connected Page, and — when an authorization returned
 * several and is waiting on a choice — the Pages to choose between.
 *
 * Only names and ids leave here. The Page tokens stay sealed in the pending
 * record until one is chosen.
 */
export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) return jsonResponse({ error: 'Organization ID is required' }, { status: 400 })

  const { env, organization} = await requireOrganizationAccess(event, organizationId)
  const connection = await getFacebookPagesConnection(env, organization.id)

  const handle = event.url.searchParams.get('handle')
  const pending = handle ? await readPendingPageSelection(env, handle) : null
  // A handle names a pending authorization, not a site; it must be this one's.
  const choices = pending && pending.organizationId === organization.id
    ? pending.pages.map(page => ({ id: page.id, name: page.name }))
    : []

  return jsonResponse({
    success: true,
    connection: connection
      ? { page_id: connection.page_id, page_name: connection.page_name, status: connection.status }
      : null,
    choices,
  })
})
import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
