import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const rebuildCalls: unknown[][] = []

mock.module('../../server/db/index.ts', {
  namedExports: {
    createDb: () => { throw new Error('createDb should not run when a DB client is provided') },
  },
})

mock.module('../../server/utils/public-search.ts', {
  namedExports: {
    rebuildPlatformKnowledgeIndex: async (...args: unknown[]) => {
      rebuildCalls.push(args)
    },
  },
})

const { schedulePlatformKnowledgeIndexRebuild } = await import('../../server/utils/platform-search-rebuild.ts')

test('scheduled search refresh skips blocking indexing confirmation', async () => {
  rebuildCalls.length = 0
  let scheduled: Promise<unknown> | undefined
  const event = {
    runtime: {
      cloudflare: {
        context: {
          waitUntil(promise: Promise<unknown>) {
            scheduled = promise
          },
        },
      },
    },
  }
  const env = {}
  const db = {}

  schedulePlatformKnowledgeIndexRebuild(event as never, env as never, 'unit test', db as never)
  await scheduled

  assert.equal(rebuildCalls.length, 1)
  assert.equal(rebuildCalls[0]?.[0], env)
  assert.equal(rebuildCalls[0]?.[1], db)
  assert.deepEqual(rebuildCalls[0]?.[2], { confirmIndexing: false })
})
