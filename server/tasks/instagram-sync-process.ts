import type { D1Database } from '@cloudflare/workers-types'
import {
  getFacebookPages,
  getLinkedInstagramAccount,
  syncFacebookPosts,
  syncInstagramPosts,
} from '~/server/utils/facebook-pages'
import { decryptSecret, encryptionEnv } from '~/server/utils/encryption'
import { execute, queryAll } from '~/server/db'
import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { hasScheduledPaidEntitlement } from '~/server/utils/scheduled-billing-access'

interface SyncTaskContext {
  cloudflare?: { env?: ApiRecord }
}

interface ConnectionRow {
  id: string
  organization_id: string
  site_id: string
  facebook_page_id: string | null
  encrypted_user_token: string
  encrypted_page_token: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan: string | null
  status: string | null
  payment_status: string | null
  paid_through: string | null
  past_due_since: string | null
  current_period_end: string | null
  cancel_at_period_end: unknown
  updated_at: string | null
}

interface SyncConnectionResult {
  connection_id: string
  organization_id: string
  site_id: string
  facebook: { success: number; errors: number; skipped: number } | null
  instagram: { success: number; errors: number; skipped: number } | null
  error?: string
}

interface TaskResult {
  connections: number
  passed: number
  failed: number
  details: SyncConnectionResult[]
}

export default defineScheduledTask({
  meta: {
    name: 'social:instagram-sync-process',
    description: 'Hourly sync of Facebook and Instagram posts for eligible Growth organizations',
  },
  async run({ context }): Promise<{ result: TaskResult }> {
    const taskContext = context as SyncTaskContext | undefined
    const env = taskContext?.cloudflare?.env ?? {}
    const db = env.DB as D1Database | undefined

    if (!db && import.meta.dev) {
      return { result: { connections: 0, passed: 0, failed: 0, details: [] } }
    }
    if (!db) throw new Error('DB is required')

    // The organization billing projection is the authority for paid scheduled
    // integrations; legacy entitlement caches are not access grants here.
    const billingRows = await queryAll<ConnectionRow>(db, `
      SELECT fpc.id, fpc.organization_id, fpc.site_id,
             fpc.facebook_page_id, fpc.encrypted_user_token, fpc.encrypted_page_token,
             ob.stripe_customer_id, ob.stripe_subscription_id, ob.plan,
             ob.status, ob.payment_status, ob.paid_through, ob.past_due_since,
             ob.current_period_end, ob.cancel_at_period_end, ob.updated_at
      FROM facebook_pages_connections fpc
      INNER JOIN organization_billing ob
        ON ob.organization_id = fpc.organization_id
       AND ob.plan = 'growth'
       AND ob.status IN ('active', 'trialing', 'past_due')
      WHERE fpc.status = 'active'
        OR (fpc.status = 'error' AND fpc.updated_at < datetime('now', '-1 hour'))
      ORDER BY fpc.organization_id
    `)
    const connections = billingRows.filter((row) => hasScheduledPaidEntitlement(row, 'managed_service'))

    if (connections.length === 0) {
      return { result: { connections: 0, passed: 0, failed: 0, details: [] } }
    }

    const tokenEnv = encryptionEnv(env)
    const syncResults: SyncConnectionResult[] = []

    for (const conn of connections) {
      const connResult: SyncConnectionResult = {
        connection_id: conn.id,
        organization_id: conn.organization_id,
        site_id: conn.site_id,
        facebook: null,
        instagram: null,
      }

      try {
        const pageToken = conn.encrypted_page_token
          ? await decryptSecret(conn.encrypted_page_token, tokenEnv)
          : null
        const userToken = await decryptSecret(conn.encrypted_user_token, tokenEnv)
        const activeToken = pageToken ?? userToken

        // Fall back to fetching pages from Graph API if page_id isn't stored
        let pageId = conn.facebook_page_id
        if (!pageId) {
          const pages = await getFacebookPages(userToken)
          pageId = pages[0]?.id ?? null
        }

        if (!pageId) {
          connResult.error = 'no_resolvable_page'
        } else if (pageId) {
          connResult.facebook = await syncFacebookPosts(env, conn.organization_id, conn.site_id, activeToken, pageId)

          const igUserId = await getLinkedInstagramAccount(activeToken, pageId)
          if (igUserId) {
            connResult.instagram = await syncInstagramPosts(env, conn.organization_id, conn.site_id, activeToken, igUserId)
          }
        }
      } catch (err) {
        connResult.error = err instanceof Error ? err.message : String(err)
        console.error(`[instagram-sync-process] failed for connection ${conn.id}:`, connResult.error)

        // Surface the error in the dashboard connection status; retry after 1h via updated_at
        await execute(db, `
          UPDATE facebook_pages_connections SET status = 'error', updated_at = ? WHERE id = ?
        `, [new Date().toISOString(), conn.id])
          .catch(updateErr => console.error(`[instagram-sync-process] failed to persist error status for connection ${conn.id}:`, updateErr))
      }

      syncResults.push(connResult)
    }

    return {
      result: {
        connections: connections.length,
        passed: syncResults.filter(r => !r.error).length,
        failed: syncResults.filter(r => r.error).length,
        details: syncResults,
      },
    }
  },
})
