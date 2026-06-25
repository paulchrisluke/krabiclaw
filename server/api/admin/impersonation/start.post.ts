import { appendResponseHeader, getHeaders } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth, getAuthSession } from '~/server/utils/auth'
import { anonymizeId, isPlatformAdmin } from '~/server/utils/platform-auth'

const IMPERSONATION_START_TIMEOUT_MS = 8_000

interface ImpersonationApi {
  impersonateUser(input: {
    body: { userId: string }
    headers: HeadersInit
    asResponse: true
  }): Promise<Response>
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformAdmin(session.user, env)) return jsonResponse({ error: 'Platform admin access required' }, { status: 403 })

  const body = await readBody<{ userId?: string }>(event)
  const userId = typeof body?.userId === 'string' ? body.userId : ''
  if (!userId) return jsonResponse({ error: 'userId is required' }, { status: 400 })
  const hashedUserId = anonymizeId(userId, env)
  const hashedInitiatorUserId = anonymizeId(session.user.id, env)

  const auth = createAuth(env)

  let response: Response
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  try {
    const impersonationApi = auth.api as unknown as ImpersonationApi
    const impersonationPromise = impersonationApi.impersonateUser({
      body: { userId },
      headers: getHeaders(event) as HeadersInit,
      asResponse: true,
    })

    response = await Promise.race([
      impersonationPromise,
      new Promise<Response>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new DOMException('Impersonation start timed out', 'AbortError')), IMPERSONATION_START_TIMEOUT_MS)
      }),
    ])
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Unknown network error')
    const isAbort = normalizedError.name === 'AbortError'
    console.error('admin_impersonation_start_request_failed', {
      hashedUserId,
      timeoutMs: IMPERSONATION_START_TIMEOUT_MS,
      error: normalizedError.message
    })
    return jsonResponse({ error: isAbort ? 'Impersonation start timed out' : 'Failed to start impersonation' }, { status: isAbort ? 504 : 502 })
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const bodyPreview = text.length > 200 ? `${text.slice(0, 200)}...` : text
    console.error('admin_impersonation_start_failed', {
      hashedUserId,
      status: response.status,
      bodyPreview,
      bodyLength: text.length
    })
    return jsonResponse({ error: 'Failed to start impersonation' }, { status: response.status || 500 })
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

  console.info('admin_impersonation_start_succeeded', {
    initiatorHashedUserId: hashedInitiatorUserId,
    targetHashedUserId: hashedUserId,
    occurredAt: new Date().toISOString()
  })

  return jsonResponse({ success: true })
})
