import { drainPublicResourceCacheInvalidations } from '~/server/utils/public-resource-cache'

export default defineTask({
  meta: {
    name: 'public-resource-cache-invalidation',
    description: 'Drain durable public-resource cache invalidations',
  },
  async run({ context }): Promise<{ result: { processed: number; skipped?: string } }> {
    const env = (context as { cloudflare?: { env?: { DB?: D1Database; SITE_CACHE?: KVNamespace } } } | undefined)?.cloudflare?.env
    if (!env?.DB || !env.SITE_CACHE) {
      if (import.meta.dev) return { result: { processed: 0, skipped: 'DB or SITE_CACHE unavailable in local scheduled task context' } }
      throw new Error('DB and SITE_CACHE are required')
    }
    return { result: { processed: await drainPublicResourceCacheInvalidations(env.DB, env.SITE_CACHE) } }
  },
})
