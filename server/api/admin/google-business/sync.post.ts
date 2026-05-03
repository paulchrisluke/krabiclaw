import { toWebRequest } from 'h3'
import { isAdminRequest } from '../../../utils/admin-auth'
import { syncGoogleBusiness, updateNotificationSetting } from '../../../utils/google-business'
import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  if (!(await isAdminRequest(toWebRequest(event), env))) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = getRequestURL(event)
  const setupNotifications = url.searchParams.get('setupNotifications') === 'true'
  const notifications = setupNotifications ? await updateNotificationSetting(env) : null
  const sync = await syncGoogleBusiness(env)

  return jsonResponse({ ok: true, notifications, sync })
})
