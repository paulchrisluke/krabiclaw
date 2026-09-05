import { drainPublicResourceCacheInvalidations } from '~/server/utils/public-resource-cache'
import { defineScheduledTask } from '~/server/utils/scheduled-task'

export default defineScheduledTask({
  meta: {
    name: 'public-resource-cache-invalidation',
    description: 'Drain durable public-resource cache invalidations',
  },
  async run({ context }): Promise<{ result: { processed: number; skipped?: string } }> {
    const env = (context as { cloudflare?: { env?: { DB?: D1Database; SITE_CACHE?: KVNamespace; NUXT_PUBLIC_FREE_SITE_DOMAIN?: string } } } | undefined)?.cloudflare?.env
    if (!env?.DB || !env.SITE_CACHE) {
      if (import.meta.dev) return { result: { processed: 0, skipped: 'DB or SITE_CACHE unavailable in local scheduled task context' } }
      throw new Error('DB and SITE_CACHE are required')
    }
    return { result: { processed: await drainPublicResourceCacheInvalidations(env.DB, env.SITE_CACHE, {
      freeSiteDomain: env.NUXT_PUBLIC_FREE_SITE_DOMAIN,
    }) } }
  },
})
