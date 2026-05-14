import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { anonymizeId, isPlatformOwner } from '~/server/utils/platform-auth'
import { domainInstructions, syncDomainWithCloudflare } from '~/server/utils/domains'

const SYNC_TIMEOUT_MS = 20_000
// Best-effort in-memory guard only; this does not coordinate across Worker isolates.
// For global locking in production, prefer Durable Objects, KV-based lease keys, or D1 lock records.
const domainSyncInFlight = new Set<string>()

interface SyncError extends Error {
  code?: string
}

export default defineEventHandler(async (event) => {
  const domainId = getRouterParam(event, 'domainId')
  if (!domainId) return jsonResponse({ error: 'Domain ID is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformOwner(session.user.email, env)) return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })
  if (domainSyncInFlight.has(domainId)) return jsonResponse({ error: 'Domain sync already in progress' }, { status: 409 })

  domainSyncInFlight.add(domainId)
  const hashedUserId = anonymizeId(session.user.id, env)
  try {
    console.info('admin_domain_sync_started', { hashedUserId, domainId })

    const controller = new AbortController()
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort()
        const timeoutError: SyncError = new Error(`Domain sync timed out after ${SYNC_TIMEOUT_MS}ms`)
        timeoutError.code = 'SYNC_TIMEOUT'
        reject(timeoutError)
      }, SYNC_TIMEOUT_MS)
    })

    const domain = await Promise.race([
      syncDomainWithCloudflare(env, db, domainId, 'admin', session.user.id, controller.signal),
      timeoutPromise
    ]).finally(() => {
      if (timeoutHandle) clearTimeout(timeoutHandle)
    })

    console.info('admin_domain_sync_succeeded', { hashedUserId, domainId })
    return jsonResponse({ success: true, domain: { ...domain, instructions: domainInstructions(domain) } })
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Failed to sync domain')
    const message = normalizedError.message || 'Failed to sync domain'
    console.error('admin_domain_sync_failed', {
      hashedUserId,
      domainId,
      error: message
    })

    const errorCode = (normalizedError as SyncError).code
    const errorName = normalizedError.name
    if (errorCode === 'SYNC_TIMEOUT' || errorName === 'AbortError') {
      return jsonResponse({ error: message }, { status: 504 })
    }

    if (normalizedError.message === 'Domain not found') {
      return jsonResponse({ error: message }, { status: 404 })
    }

    return jsonResponse({ error: message }, { status: 500 })
  } finally {
    domainSyncInFlight.delete(domainId)
  }
})
