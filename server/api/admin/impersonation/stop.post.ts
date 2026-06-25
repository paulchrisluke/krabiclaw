import { appendResponseHeader, getHeaders } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth, getAuthSession } from '~/server/utils/auth'
import { isPlatformAdmin } from '~/server/utils/platform-auth'

interface SessionMeta {
  impersonatedBy?: string | null
}

interface StopImpersonationApi {
  stopImpersonating(input: {
    headers: HeadersInit
    asResponse: true
  }): Promise<Response>
}

const IMPERSONATION_STOP_TIMEOUT_MS = 5_000

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
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  try {
    const stopPromise = stopApi.stopImpersonating({
      headers: getHeaders(event) as HeadersInit,
      asResponse: true
    })
    response = await Promise.race([
      stopPromise,
      new Promise<Response>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new DOMException('Stop impersonation timed out', 'AbortError')), IMPERSONATION_STOP_TIMEOUT_MS)
      })
    ])
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Auth API invocation failed')
    const isAbort = normalizedError.name === 'AbortError'
    console.error('admin_impersonation_stop_failed', {
      timeoutMs: IMPERSONATION_STOP_TIMEOUT_MS,
      error: normalizedError.message
    })
    return jsonResponse({ error: isAbort ? 'Stop impersonation timed out' : 'Failed to stop impersonation' }, { status: isAbort ? 504 : 502 })
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
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
