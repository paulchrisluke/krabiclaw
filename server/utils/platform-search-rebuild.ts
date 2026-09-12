import type { H3Event } from 'nitro'
import { createDb, type DbClient } from '~/server/db'
import type { CloudflareEnv } from '~/server/utils/auth'
import { rebuildPlatformKnowledgeIndex } from '~/server/utils/public-search'

function describeErrorChain(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  while (current instanceof Error) {
    const described = `${current.name}: ${current.message}`
    if (!parts.includes(described)) parts.push(described)
    current = current.cause
  }
  if (parts.length === 0) parts.push(String(error))
  return parts.join(' <- ')
}

let rebuildQueue: Promise<void> = Promise.resolve()
let rebuildPending = false

export function schedulePlatformKnowledgeIndexRebuild(
  event: H3Event,
  env: CloudflareEnv,
  context: string,
  db: DbClient | null = env.db ?? (env.DB ? createDb(env.DB) : null),
) {
  if (!db) return

  if (rebuildPending) {
    return
  }

  rebuildPending = true

  const run = rebuildQueue
    .catch(() => {})
    .then(async () => {
      rebuildPending = false
      await rebuildPlatformKnowledgeIndex(env, db, { confirmIndexing: false })
    })

  rebuildQueue = run
  const guarded = run.catch((error) => {
    // Workers Logs serialises a bare Error to its stack alone, so passing the Error as a
    // second console.error argument printed twelve identical stack traces and not one word
    // of what failed (issue #917). Flatten the message chain — uploadIndexItem already
    // names the failing key, and its `cause` carries the AI Search error — into the
    // message itself, where Observability can actually read it.
    console.error(`Failed to rebuild platform knowledge index after ${context}: ${describeErrorChain(error)}`)
  })
  const executionContext = event.req.runtime?.cloudflare?.context
  if (executionContext) {
    executionContext.waitUntil(guarded)
  } else {
    void guarded
  }
}
