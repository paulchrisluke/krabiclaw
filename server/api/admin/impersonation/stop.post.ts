import { getHeader, getRequestURL, setResponseHeader } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const canStop = Boolean((session?.session as any)?.impersonatedBy) || isPlatformOwner(session.user.email, env)
  if (!canStop) return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })

  const authUrl = `${getRequestURL(event).origin}/api/auth/admin/stop-impersonating`
  const response = await fetch(authUrl, {
    method: 'POST',
    headers: {
      cookie: getHeader(event, 'cookie') || ''
    }
  })

  const setCookie = response.headers.get('set-cookie')
  if (setCookie) setResponseHeader(event, 'set-cookie', setCookie)

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.error('admin_impersonation_stop_failed', { status: response.status, body: text })
    return jsonResponse({ error: 'Failed to stop impersonation' }, { status: response.status || 500 })
  }

  return jsonResponse({ success: true })
})