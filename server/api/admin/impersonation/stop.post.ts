import { appendResponseHeader, getHeaders } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth, getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'

interface SessionMeta {
  impersonatedBy?: string | null
}

interface StopImpersonationApi {
  stopImpersonating(_input: {
    headers: HeadersInit
    asResponse: true
  }): Promise<Response>
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const sessionMeta = session?.session as SessionMeta | undefined
  const canStop = Boolean(sessionMeta?.impersonatedBy) || isPlatformAdmin(session.user, env)
  if (!canStop) return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })

  const auth = createAuth(env)
  const stopApi = auth.api as unknown as StopImpersonationApi

  let response: Response
  try {
    response = await stopApi.stopImpersonating({
      headers: getHeaders(event) as HeadersInit,
      asResponse: true
    })
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Auth API invocation failed')
    console.error('admin_impersonation_stop_failed', {
      error: normalizedError.message
    })
    return jsonResponse({ error: 'Failed to stop impersonation' }, { status: 502 })
  }

  const headerBag = response.headers as Headers & {
    getSetCookie?: () => string[]
    getAll?: (_name: string) => string[]
    raw?: () => Record<string, string[]>
  }
  const setCookies = typeof headerBag.getSetCookie === 'function'
    ? headerBag.getSetCookie()
    : typeof headerBag.getAll === 'function'
      ? headerBag.getAll('set-cookie')
      : (headerBag.raw?.()['set-cookie'] || [])

  for (const cookieValue of setCookies) {
    appendResponseHeader(event, 'set-cookie', cookieValue)
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.error('admin_impersonation_stop_failed', { status: response.status, body: text })
    return jsonResponse({ error: 'Failed to stop impersonation' }, { status: response.status || 500 })
  }

  return jsonResponse({ success: true })
})
