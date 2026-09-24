import { defineHandler } from 'nitro'
import { getQuery } from 'nitro/h3'
import { jsonResponse } from '~/server/utils/api-response'
import { getFacebookPagesConnection } from '~/server/utils/facebook-pages'
import { readInstagramConnection } from '~/server/utils/instagram'
import { requireRequestedLocationAccess, requireRequestedOrganizationWideAccess } from '~/server/utils/location-access'

/**
 * Which social channels a post can be published to. A location's editor asks
 * this from the post editor, so it answers with names only — never a token —
 * and is readable with location access.
 */
export default defineHandler(async (event) => {
  const query = getQuery(event) as { organizationId?: string; locationId?: string }
  const { env, organization } = query.locationId
    ? await requireRequestedLocationAccess(event, query.locationId, query.organizationId)
    : await requireRequestedOrganizationWideAccess(event, query.organizationId)

  const [facebook, instagram] = await Promise.all([
    getFacebookPagesConnection(env, organization.id),
    readInstagramConnection(env, organization.id),
  ])

  return jsonResponse({
    facebook: facebook ? { page_name: facebook.page_name } : null,
    instagram: instagram ? { username: instagram.username } : null,
  })
})
