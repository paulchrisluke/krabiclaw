import { getHeaders, getRouterParam, toWebRequest } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import { requireSiteAccess } from '~/server/utils/location-access'
import { listAccessibleLocationIds } from '~/server/utils/member-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) throw createError({ statusCode: 400, message: 'Missing site id' })

  const { env, site, db } = await requireSiteAccess(event, siteId, 'context')
  const namespace = env.GUEST_INBOX_HUBS
  if (!namespace) throw createError({ statusCode: 503, message: 'Guest inbox binding is not configured' })

  const allowedLocationIds = await listAccessibleLocationIds(db, {
    memberId: site.member_id,
    role: site.member_role,
    organizationId: site.organization_id,
    siteId,
  })

  const headers = new Headers(getHeaders(event) as HeadersInit)
  headers.set('x-krabiclaw-site-id', siteId)
  headers.set('x-krabiclaw-member-id', site.member_id)
  headers.set('x-krabiclaw-allowed-location-ids', allowedLocationIds === null ? '*' : JSON.stringify(allowedLocationIds))

  return await namespace.get(namespace.idFromName(siteId)).fetch(new Request(toWebRequest(event), { headers }))
})
import { defineEventHandler } from 'h3'
