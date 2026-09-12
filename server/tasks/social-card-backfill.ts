import type { CloudflareEnv } from '~/server/utils/auth'
import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { listSocialCardOwners, refreshSocialCard } from '~/server/utils/social-card'
import { summarizeSocialCardRefreshResults } from '~/utils/social-card-refresh'

// This task reconciles; it is not the backfill tool. Bulk work goes through
// POST /api/editor/sites/{siteId}/social-cards/regenerate, which reports every
// outcome. Keeping this at one render per run is what bounds memory (#876).
const OWNERS_PER_RUN = 1
const CURSOR_KEY = 'social-card-backfill:cursor'

export default defineScheduledTask({
  meta: { name: 'social-card-backfill', description: 'Reconcile a bounded page of social cards' },
  async run({ context }) {
    const env = (context as { cloudflare?: { env?: CloudflareEnv } } | undefined)?.cloudflare?.env
    if (!env?.DB || !env.SITE_CACHE) throw new Error('DB and SITE_CACHE are required')
    const after = await env.SITE_CACHE.get(CURSOR_KEY)
    const owners = await listSocialCardOwners(env.DB, { after, limit: OWNERS_PER_RUN + 1 })
    const results = []
    for (const owner of owners.slice(0, OWNERS_PER_RUN)) {
      results.push(await refreshSocialCard({ db: env.DB, env, owner: { owner_type: owner.owner_type, owner_id: owner.owner_id } }))
      await env.SITE_CACHE.put(CURSOR_KEY, owner.cursor)
    }
    const hasMore = owners.length > OWNERS_PER_RUN
    if (!hasMore) await env.SITE_CACHE.delete(CURSOR_KEY)
    return { result: { ...summarizeSocialCardRefreshResults(results), hasMore, outcomes: results } }
  },
})
