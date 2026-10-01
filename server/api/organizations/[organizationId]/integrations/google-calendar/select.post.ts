import { defineHandler } from 'nitro'
import { getRouterParam, readBody } from 'nitro/h3'
import { INTEGRATION_SCOPES } from '~/shared/organization-settings'
import { jsonResponse } from '~/server/utils/api-response'
import { linkedAccountAccessToken, requireIntegrationAccount } from '~/server/utils/auth'
import { calendarGroups, listWritableCalendars, readCalendarIntegration, storeCalendarSelection } from '~/server/utils/google-calendar'
import { requireOrganizationAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const id = getRouterParam(event, 'organizationId')
  if (!id) return jsonResponse({ error: 'Organization ID required' }, { status: 400 })
  const { env, session, organization } = await requireOrganizationAccess(event, id)
  const body = await readBody<{ account_id?: string; calendar_id?: string; calendar_group?: string | null; include_reservations?: boolean }>(event)
  if (!body?.account_id || !body.calendar_id || (body.calendar_group != null && typeof body.calendar_group !== 'string') || typeof body.include_reservations !== 'boolean') return jsonResponse({ error: 'Choose an account, calendar and booking policy.' }, { status: 400 })
  const current = await readCalendarIntegration(env.DB, organization.id)
  await requireIntegrationAccount(env, body.account_id, { userId: session.user.id, currentAccountId: current?.account_id, providerId: 'google', scopes: INTEGRATION_SCOPES['google-calendar'] })
  if (body.calendar_group && !(await calendarGroups(env.DB, organization.id)).some(group => group.calendar_group === body.calendar_group)) return jsonResponse({ error: 'Choose an existing consultation calendar group.' }, { status: 400 })
  if (!body.calendar_group && !body.include_reservations) return jsonResponse({ error: 'Choose what this calendar mirrors.' }, { status: 400 })
  try {
    const calendar = (await listWritableCalendars((await linkedAccountAccessToken(env, body.account_id)).accessToken)).find(item => item.id === body.calendar_id)
    if (!calendar) return jsonResponse({ error: 'Choose a calendar where this account has writer access.' }, { status: 400 })
    await storeCalendarSelection(env.DB, organization.id, { account_id: body.account_id, calendar_id: calendar.id, calendar_name: calendar.summary, calendar_group: body.calendar_group || null, include_reservations: body.include_reservations })
    return jsonResponse({ success: true, sync: 'Upcoming active bookings will be reconciled by the scheduled worker.' })
  } catch (error) { return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, { status: 502 }) }
})
