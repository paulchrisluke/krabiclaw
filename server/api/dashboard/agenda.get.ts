import { HTTPError, defineHandler  } from 'nitro';
import { getQuery } from 'nitro/h3';
import { jsonResponse } from '~/server/utils/api-response'
import { AGENDA_KINDS, listAgenda, type AgendaKind } from '~/server/utils/dashboard-agenda'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { finalizeRequestMetrics } from '~/server/utils/request-metrics'

function stringQuery(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export default defineHandler(async (event) => {
  const { env, db, organization } = await getDashboardContext(event, { requireSite: false })
  const query = getQuery(event)
  const from = stringQuery(query.from)
  const to = stringQuery(query.to)
  if (!from || !to) throw new HTTPError({ statusCode: 400, statusMessage: 'from and to are required' })
  const requestedKinds = stringQuery(query.kinds)?.split(',').map(kind => kind.trim()).filter((kind): kind is AgendaKind => AGENDA_KINDS.includes(kind as AgendaKind))
  const payload = await listAgenda(db, organization.id, {
    from, to, siteId: stringQuery(query.siteId), locationId: stringQuery(query.locationId), kinds: requestedKinds, organizationSlug: organization.slug, principal: { env, memberId: organization.memberId, role: organization.role }, })
  return jsonResponse(finalizeRequestMetrics(event, 'dashboard-agenda', payload))
})
