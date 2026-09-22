import type { D1Database } from '@cloudflare/workers-types'
import {
  getFacebookPages,
  getLinkedInstagramAccount,
  syncFacebookPosts,
  syncInstagramPosts,
} from '~/server/utils/facebook-pages'
import { decryptSecret, encryptionEnv } from '~/server/utils/encryption'
import { execute, queryAllPages } from '~/server/db'
import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { filterEntitledRows } from '~/server/utils/billing-access'
import type { CloudflareEnv } from '~/server/utils/auth'

interface SyncTaskContext {
  cloudflare?: { env?: ApiRecord }
}


interface ConnectionRow {
  revision: string | null
  id: string
  organization_id: string
  facebook_page_id: string | null
  encrypted_user_token: string
  encrypted_page_token: string | null
}

interface SyncConnectionResult {
  connection_id: string
  organization_id: string
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

    // Better Auth's subscription table is the authority for paid scheduled
    // integrations; candidates are selected here and filtered against it below.
    const candidates = await queryAllPages<ConnectionRow>(db, `
      SELECT json_extract(s.integrations_json, '$.facebook.id') AS id, s.organization_id, s.id AS organization_id,
             json_extract(s.integrations_json, '$.facebook.revision') AS revision,
             json_extract(s.integrations_json, '$.facebook.facebook_page_id') AS facebook_page_id,
             json_extract(s.integrations_json, '$.facebook.encrypted_user_token') AS encrypted_user_token,
             json_extract(s.integrations_json, '$.facebook.encrypted_page_token') AS encrypted_page_token
      FROM organization s
      WHERE json_extract(s.integrations_json, '$.facebook.status') = 'active'
        OR (json_extract(s.integrations_json, '$.facebook.status') = 'error' AND json_extract(s.integrations_json, '$.facebook.updated_at') < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour'))
      ORDER BY s.organization_id, s.id
    `, [])
    const connections = await filterEntitledRows(env as CloudflareEnv, candidates, 'managed_service')

    if (connections.length === 0) {
      return { result: { connections: 0, passed: 0, failed: 0, details: [] } }
    }

    const tokenEnv = encryptionEnv(env)
    const syncResults: SyncConnectionResult[] = []

    for (const conn of connections) {
      const connResult: SyncConnectionResult = {
        connection_id: conn.id,
        organization_id: conn.organization_id,
        
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
          connResult.facebook = await syncFacebookPosts(env, conn.organization_id, conn.organization_id, activeToken, pageId)

          const igUserId = await getLinkedInstagramAccount(activeToken, pageId)
          if (igUserId) {
            connResult.instagram = await syncInstagramPosts(env, conn.organization_id, conn.organization_id, activeToken, igUserId)
          }
        }
      } catch (err) {
        connResult.error = err instanceof Error ? err.message : String(err)
        console.error(`[instagram-sync-process] failed for connection ${conn.id}:`, connResult.error)

        // Surface the error in the dashboard connection status; retry after 1h via updated_at
        await execute(db, `
          UPDATE organization SET integrations_json = json_set(integrations_json, '$.facebook.status', 'error',
            '$.facebook.updated_at', ?, '$.facebook.revision', ?)
          WHERE id = ? AND organization_id = ? AND json_extract(integrations_json, '$.facebook.revision') IS ?
        `, [new Date().toISOString(), crypto.randomUUID(), conn.organization_id, conn.organization_id, conn.revision])
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
