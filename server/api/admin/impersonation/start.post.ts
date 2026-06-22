import { appendResponseHeader, getHeader } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { anonymizeId, isPlatformAdmin } from '~/server/utils/platform-auth'

const IMPERSONATION_START_TIMEOUT_MS = 8_000

interface AuthOriginEnv {
  AUTH_SERVICE_ORIGIN?: string
  [key: string]: string | undefined
}

function getTrustedAuthOrigin(env: AuthOriginEnv): string {
  const rawOrigin = String(env.AUTH_SERVICE_ORIGIN || '').trim()
  if (!rawOrigin) throw new Error('AUTH_SERVICE_ORIGIN is required')

  let parsed: URL
  try {
    parsed = new URL(rawOrigin)
  } catch {
    throw new Error('AUTH_SERVICE_ORIGIN must be a valid URL origin')
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('AUTH_SERVICE_ORIGIN must use http or https')
  }

  if (!parsed.hostname) {
    throw new Error('AUTH_SERVICE_ORIGIN must include a hostname')
  }

  return parsed.origin
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

  let authOrigin = ''
  try {
    authOrigin = getTrustedAuthOrigin(env)
  } catch (err) {
    const normalizedError = err instanceof Error ? err : new Error('Invalid auth origin configuration')
    console.error('admin_impersonation_start_config_error', {
      error: normalizedError.message
    })
    return jsonResponse({ error: 'Impersonation service is not configured' }, { status: 503 })
  }

  const authUrl = `${authOrigin}/api/auth/admin/impersonate-user`
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), IMPERSONATION_START_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(authUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        cookie: getHeader(event, 'cookie') || '',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ userId })
    })
  } catch (error) {
    clearTimeout(timeoutHandle)
    const normalizedError = error instanceof Error ? error : new Error('Unknown network error')
    const isAbort = normalizedError.name === 'AbortError'
    console.error('admin_impersonation_start_request_failed', {
      hashedUserId,
      authUrl,
      timeoutMs: IMPERSONATION_START_TIMEOUT_MS,
      error: normalizedError.message
    })
    return jsonResponse({ error: isAbort ? 'Impersonation start timed out' : 'Failed to start impersonation' }, { status: isAbort ? 504 : 502 })
  }

  clearTimeout(timeoutHandle)

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const bodyPreview = text.length > 200 ? `${text.slice(0, 200)}...` : text
    console.error('admin_impersonation_start_failed', {
      hashedUserId,
      authUrl,
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
