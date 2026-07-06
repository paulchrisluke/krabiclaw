import type { H3Event } from 'h3'
import { createDb, type DbClient } from '~/server/db'
import type { CloudflareEnv } from '~/server/utils/auth'
import { rebuildPlatformKnowledgeIndex } from '~/server/utils/public-search'

let rebuildQueue: Promise<void> = Promise.resolve()

export function schedulePlatformKnowledgeIndexRebuild(
  event: H3Event,
  env: CloudflareEnv,
  context: string,
  db: DbClient | null = env.db ?? (env.DB ? createDb(env.DB) : null),
) {
  if (!db) return

  const run = rebuildQueue
    .catch(() => {})
    .then(async () => {
      await rebuildPlatformKnowledgeIndex(env, db)
    })

  rebuildQueue = run
  const guarded = run.catch((error) => {
    console.error(`Failed to rebuild platform knowledge index after ${context}:`, error)
  })
  const waitUntil = event.context.cloudflare?.context?.waitUntil
  if (waitUntil) {
    waitUntil(guarded)
  } else {
    void guarded
  }
}
