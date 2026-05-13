import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { isPlatformOwner } from '~/server/utils/platform-auth'
import { domainInstructions, syncDomainWithCloudflare } from '~/server/utils/domains'

const SYNC_TIMEOUT_MS = 20_000

export default defineEventHandler(async (event) => {
  const domainId = getRouterParam(event, 'domainId')
  if (!domainId) return jsonResponse({ error: 'Domain ID is required' }, { status: 400 })

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.email) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!isPlatformOwner(session.user.email, env)) return jsonResponse({ error: 'Platform owner access required' }, { status: 403 })

  try {
    console.info('admin_domain_sync_started', { userId: session.user.id, domainId })

    const domain = await Promise.race([
      syncDomainWithCloudflare(env, db, domainId, 'admin', session.user.id),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          const timeoutError = new Error(`Domain sync timed out after ${SYNC_TIMEOUT_MS}ms`)
          ;(timeoutError as any).code = 'SYNC_TIMEOUT'
          reject(timeoutError)
        }, SYNC_TIMEOUT_MS)
      })
    ])

    console.info('admin_domain_sync_succeeded', { userId: session.user.id, domainId })
    return jsonResponse({ success: true, domain: { ...domain, instructions: domainInstructions(domain) } })
  } catch (error: any) {
    const message = error?.message || 'Failed to sync domain'
    console.error('admin_domain_sync_failed', {
      userId: session.user.id,
      domainId,
      error: message
    })

    if (error?.code === 'SYNC_TIMEOUT') {
      return jsonResponse({ error: message }, { status: 504 })
    }

    return jsonResponse({ error: message }, { status: 500 })
  }
})
