import type { D1Database } from '@cloudflare/workers-types'
import {
  getFacebookPages,
  getLinkedInstagramAccount,
  syncFacebookPosts,
  syncInstagramPosts,
} from '~/server/utils/facebook-pages'
import { decryptSecret, encryptionEnv } from '~/server/utils/encryption'

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

export default defineTask({
  meta: {
    name: 'social:instagram-sync-process',
    description: 'Hourly sync of Facebook and Instagram posts for managed-service orgs',
  },
  async run({ context }): Promise<{ result: TaskResult }> {
    const taskContext = context as SyncTaskContext | undefined
    const env = taskContext?.cloudflare?.env ?? {}
    const db = env.DB as D1Database | undefined

    if (!db && import.meta.dev) {
      return { result: { connections: 0, passed: 0, failed: 0, details: [] } }
    }
    if (!db) throw new Error('DB is required')

    // Only sync orgs with managed_service entitlement (Managed + SEO Accelerator plans)
    const { results } = await db.prepare(`
      SELECT fpc.id, fpc.organization_id, fpc.site_id,
             fpc.facebook_page_id, fpc.encrypted_user_token, fpc.encrypted_page_token
      FROM facebook_pages_connections fpc
      INNER JOIN site_entitlements oe
        ON oe.site_id = fpc.site_id
        AND oe.key = 'managed_service'
        AND oe.value = 'true'
      WHERE fpc.status = 'active'
        OR (fpc.status = 'error' AND fpc.updated_at < datetime('now', '-1 hour'))
      ORDER BY fpc.organization_id
    `).all()

    const connections = (results ?? []) as unknown as ConnectionRow[]

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
        await db.prepare(`
          UPDATE facebook_pages_connections SET status = 'error', updated_at = ? WHERE id = ?
        `).bind(new Date().toISOString(), conn.id).run()
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
