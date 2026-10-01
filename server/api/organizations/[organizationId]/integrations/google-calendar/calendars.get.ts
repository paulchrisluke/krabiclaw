import { defineHandler } from 'nitro'
import { getRouterParam } from 'nitro/h3'
import { INTEGRATION_SCOPES } from '~/shared/organization-settings'
import { jsonResponse } from '~/server/utils/api-response'
import { linkedAccountAccessToken, requireIntegrationAccount } from '~/server/utils/auth'
import { calendarGroups, listWritableCalendars, readCalendarIntegration } from '~/server/utils/google-calendar'
import { requireOrganizationAccess } from '~/server/utils/location-access'

export default defineHandler(async (event) => {
  const id = getRouterParam(event, 'organizationId')
  if (!id) return jsonResponse({ error: 'Organization ID required' }, { status: 400 })
  const { env, session, organization } = await requireOrganizationAccess(event, id)
  const calendar = await readCalendarIntegration(env.DB, organization.id)
  const groups = await calendarGroups(env.DB, organization.id)
  const accountId = event.url.searchParams.get('account_id') || calendar?.account_id || null
  if (!accountId) return jsonResponse({ account_id: null, calendar, groups, calendars: [], error: null })
  await requireIntegrationAccount(env, accountId, { userId: session.user.id, currentAccountId: calendar?.account_id, providerId: 'google', scopes: INTEGRATION_SCOPES['google-calendar'] })
  try {
    const calendars = await listWritableCalendars((await linkedAccountAccessToken(env, accountId)).accessToken)
    return jsonResponse({ account_id: accountId, calendar, groups, calendars, error: null })
  } catch (error) {
    return jsonResponse({ account_id: accountId, calendar, groups, calendars: [], error: error instanceof Error ? error.message : String(error) })
  }
})
