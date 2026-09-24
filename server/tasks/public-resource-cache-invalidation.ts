import { drainPublicResourceCacheInvalidations, type OrganizationChangeDrainEnv } from '~/server/utils/public-resource-cache'
import { defineScheduledTask } from '~/server/utils/scheduled-task'

export default defineScheduledTask({
  meta: {
    name: 'public-resource-cache-invalidation',
    description: 'Drain durable public-resource cache invalidations',
  },
  async run({ context }): Promise<{ result: { processed: number; skipped?: string } }> {
    const env = (context as { cloudflare?: { env?: { DB?: D1Database; ORGANIZATION_CACHE?: KVNamespace } & OrganizationChangeDrainEnv } } | undefined)?.cloudflare?.env
    if (!env?.DB || !env.ORGANIZATION_CACHE) {
      if (import.meta.dev) return { result: { processed: 0, skipped: 'DB or ORGANIZATION_CACHE unavailable in local scheduled task context' } }
      throw new Error('DB and ORGANIZATION_CACHE are required')
    }
    return { result: { processed: await drainPublicResourceCacheInvalidations(env.DB, env.ORGANIZATION_CACHE, env, {}) } }
  },
})
