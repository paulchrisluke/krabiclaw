import { clearAdminSessionCookie } from '../../utils/admin-auth'
import { jsonResponse } from '../../utils/api-response'

export default defineEventHandler(() =>
  jsonResponse({ ok: true }, {
    headers: {
      'Set-Cookie': clearAdminSessionCookie()
    }
  })
)
