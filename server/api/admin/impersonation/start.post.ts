import { getHeader, getRequestURL, setResponseHeader } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformOwner(session.user.email, env)) return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })

  const body = await readBody<{ userId?: string }>(event)
  const userId = typeof body?.userId === 'string' ? body.userId : ''
  if (!userId) return jsonResponse({ error: 'userId is required' }, { status: 400 })

  const authUrl = `${getRequestURL(event).origin}/api/auth/admin/impersonate-user`
  const response = await fetch(authUrl, {
    method: 'POST',
    headers: {
      cookie: getHeader(event, 'cookie') || '',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ userId })
  })

  const setCookie = response.headers.get('set-cookie')
  if (setCookie) setResponseHeader(event, 'set-cookie', setCookie)

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.error('admin_impersonation_start_failed', { userId, status: response.status, body: text })
    return jsonResponse({ error: 'Failed to start impersonation' }, { status: response.status || 500 })
  }

  return jsonResponse({ success: true })
})