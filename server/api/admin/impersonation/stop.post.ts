import { appendResponseHeader, getHeader, getRequestURL } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth, getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'

interface SessionMeta {
  impersonatedBy?: string | null
}

const IMPERSONATION_STOP_TIMEOUT_MS = 5_000

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const sessionMeta = session?.session as SessionMeta | undefined
  const canStop = Boolean(sessionMeta?.impersonatedBy) || isPlatformAdmin(session.user, env)
  if (!canStop) return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })

  const authUrl = `${getRequestURL(event).origin}/api/auth/admin/stop-impersonating`
  const auth = createAuth(env)
  let response: Response
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), IMPERSONATION_STOP_TIMEOUT_MS)

  try {
    response = await auth.handler(new Request(authUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        cookie: getHeader(event, 'cookie') || ''
      }
    }))
  } catch (error) {
    clearTimeout(timeoutHandle)
    const normalizedError = error instanceof Error ? error : new Error('Auth handler invocation failed')
    const isAbort = normalizedError.name === 'AbortError'
    console.error('admin_impersonation_stop_failed', {
      authUrl,
      timeoutMs: IMPERSONATION_STOP_TIMEOUT_MS,
      error: normalizedError.message
    })
    return jsonResponse({ error: isAbort ? 'Stop impersonation timed out' : 'Failed to stop impersonation' }, { status: isAbort ? 504 : 502 })
  }

  clearTimeout(timeoutHandle)

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
