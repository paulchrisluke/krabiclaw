import type { D1Database } from '@cloudflare/workers-types'
import { getFacebookPagesConnection, syncFacebookPosts } from '~/server/utils/facebook-pages'
import { readInstagramConnection, syncInstagramPosts } from '~/server/utils/instagram'
import { execute, queryAllPages } from '~/server/db'
import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { filterEntitledRows } from '~/server/utils/billing-access'
import type { CloudflareEnv } from '~/server/utils/auth'

interface SyncTaskContext {
  cloudflare?: { env?: ApiRecord }
}

interface ConnectionRow {
  organization_id: string
  facebook: string | null
  instagram: string | null
}

interface SyncResult {
  organization_id: string
  product: 'facebook' | 'instagram'
  counts: { success: number; errors: number; skipped: number } | null
  error?: string
}

interface TaskResult {
  organizations: number
  passed: number
  failed: number
  details: SyncResult[]
}

/**
 * Hourly import of each Growth organization's Facebook Page and Instagram
 * account posts. They are separate connections with separate tokens, so each
 * syncs on its own and one failing says nothing about the other.
 */
export default defineScheduledTask({
  meta: {
    name: 'social:instagram-sync-process',
    description: 'Hourly sync of Facebook and Instagram posts for eligible Growth organizations',
  },
  async run({ context }): Promise<{ result: TaskResult }> {
    const taskContext = context as SyncTaskContext | undefined
    const env = (taskContext?.cloudflare?.env ?? {}) as CloudflareEnv
    const db = env.DB as D1Database | undefined

    if (!db && import.meta.dev) {
      return { result: { organizations: 0, passed: 0, failed: 0, details: [] } }
    }
    if (!db) throw new Error('DB is required')

    // Better Auth's subscription table is the authority for paid scheduled
    // integrations; candidates are selected here and filtered against it below.
    // A connection whose last sync failed is still connected, and the next
    // hourly run is its retry.
    const candidates = await queryAllPages<ConnectionRow>(db, `
      SELECT id AS organization_id,
             json_extract(integrations_json, '$.facebook.status') AS facebook,
             json_extract(integrations_json, '$.instagram.status') AS instagram
        FROM organization
       WHERE json_extract(integrations_json, '$.facebook.status') IN ('active', 'error')
          OR json_extract(integrations_json, '$.instagram.status') IN ('active', 'error')
       ORDER BY id
    `, [])
    const organizations = await filterEntitledRows(env, candidates, 'managed_service')

    const details: SyncResult[] = []
    for (const row of organizations) {
      if (row.facebook) details.push(await syncFacebook(env, db, row.organization_id))
      if (row.instagram) details.push(await syncInstagram(env, row.organization_id))
    }

    // Each connection's status already says how its sync went; the run fails
    // too, so a failure is also where the cron run is recorded.
    const failed = details.filter(detail => detail.error || (detail.counts?.errors ?? 0) > 0)
    if (failed.length) {
      throw new Error(`Social sync failed for ${failed.length} of ${details.length} connections: ${failed.map(detail => `${detail.organization_id}/${detail.product}: ${detail.error ?? `${detail.counts?.errors} posts failed`}`).join('; ')}`)
    }
    return { result: { organizations: organizations.length, passed: details.length, failed: 0, details } }
  },
})

async function syncFacebook(env: CloudflareEnv, db: D1Database, organizationId: string): Promise<SyncResult> {
  try {
    const connection = await getFacebookPagesConnection(env, organizationId)
    if (!connection?.encrypted_page_token) throw new Error('The Facebook connection has no Page token')
    const counts = await syncFacebookPosts(env, organizationId, connection.encrypted_page_token, connection.page_id)
    await execute(db, `
      UPDATE organization SET integrations_json = json_set(integrations_json, '$.facebook.status', 'active',
        '$.facebook.updated_at', ?)
      WHERE id = ? AND json_extract(integrations_json, '$.facebook.revision') IS ?
    `, [new Date().toISOString(), organizationId, connection.revision])
    return { organization_id: organizationId, product: 'facebook', counts }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // The Facebook leaf reads the connection's status.
    await execute(db, `
      UPDATE organization SET integrations_json = json_set(integrations_json, '$.facebook.status', 'error',
        '$.facebook.updated_at', ?)
      WHERE id = ? AND json_type(integrations_json, '$.facebook') IS 'object'
    `, [new Date().toISOString(), organizationId])
    return { organization_id: organizationId, product: 'facebook', counts: null, error: message }
  }
}

async function syncInstagram(env: CloudflareEnv, organizationId: string): Promise<SyncResult> {
  try {
    const connection = await readInstagramConnection(env, organizationId)
    if (!connection) throw new Error('The Instagram connection could not be read')
    return { organization_id: organizationId, product: 'instagram', counts: await syncInstagramPosts(env, connection) }
  } catch (error) {
    return { organization_id: organizationId, product: 'instagram', counts: null, error: error instanceof Error ? error.message : String(error) }
  }
}
