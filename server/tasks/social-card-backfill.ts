import type { CloudflareEnv } from '~/server/utils/auth'
import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { listSocialCardOwners, refreshSocialCard, type SocialCardRefreshResult } from '~/server/utils/social-card'
import { summarizeSocialCardRefreshResults } from '~/utils/social-card-refresh'

// This task reconciles; it is not the backfill tool. Bulk work goes through
// POST /api/editor/organizations/{organizationId}/social-cards/regenerate, which reports every
// outcome. Keeping this at one render per run is what bounds memory (#876).
const OWNERS_PER_RUN = 1
const CURSOR_KEY = 'social-card-backfill:cursor'

export default defineScheduledTask({
  meta: { name: 'social-card-backfill', description: 'Reconcile a bounded page of social cards' },
  async run({ context }) {
    const env = (context as { cloudflare?: { env?: CloudflareEnv } } | undefined)?.cloudflare?.env
    if (!env?.DB || !env.ORGANIZATION_CACHE) throw new Error('DB and ORGANIZATION_CACHE are required')
    const after = await env.ORGANIZATION_CACHE.get(CURSOR_KEY)
    const owners = await listSocialCardOwners(env.DB, { after, limit: OWNERS_PER_RUN + 1 })
    const results: SocialCardRefreshResult[] = []
    for (const owner of owners.slice(0, OWNERS_PER_RUN)) {
      const target = { owner_type: owner.owner_type, owner_id: owner.owner_id }
      // Reported in the task's result, which is where a reconcile's outcomes are read.
      try {
        results.push(await refreshSocialCard({ db: env.DB, env, owner: target }))
      } catch (error) {
        results.push({ kind: 'failed', owner: target, error: error instanceof Error ? error.message : String(error) })
      }
      await env.ORGANIZATION_CACHE.put(CURSOR_KEY, owner.cursor)
    }
    const hasMore = owners.length > OWNERS_PER_RUN
    if (!hasMore) await env.ORGANIZATION_CACHE.delete(CURSOR_KEY)
    return { result: { ...summarizeSocialCardRefreshResults(results), hasMore, outcomes: results } }
  },
})
