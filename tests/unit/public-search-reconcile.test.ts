import assert from 'node:assert/strict'
import test from 'node:test'
import { indexItemPayload, reconcileIndexItems, type ExpandedPlatformKnowledgeDocument } from '../../server/utils/public-search.ts'
import type { CloudflareEnv } from '../../server/utils/auth.ts'

const record: ExpandedPlatformKnowledgeDocument = {
  id: 'article-1',
  key: 'dashboard/org/article/1.md',
  type: 'article',
  title: 'Current title',
  path: '/articles/1',
  snippet: 'Current summary',
  section: 'Articles',
  icon: 'file-text',
  body: 'Current body',
  surfaces: ['dashboard'],
  organizationId: 'org',
  metadata: { record_id: 'article-1', type: 'article', surface: 'dashboard', organization_id: 'org', display: 'Current title' },
}

function provider() {
  const uploads: Array<{ key: string; content: string; hash: unknown }> = []
  const env = {
    AI_SEARCH_INSTANCE_ID: 'test-index',
    AI_SEARCH: {
      get: () => ({ items: {
        upload: async (key: string, content: string, options: { metadata: Record<string, unknown> }) => {
          uploads.push({ key, content, hash: options.metadata.content_hash })
        },
        delete: async () => {},
      } }),
    },
  } as unknown as CloudflareEnv
  return { env, uploads }
}

test('a newer document overwrites an item that AI Search is still indexing', async () => {
  const { env, uploads } = provider()
  const oldHash = indexItemPayload({ ...record, body: 'Previous body' }).contentHash
  const existing = [{ id: 'item-1', key: record.key, status: 'running' as const, metadata: { content_hash: oldHash } }]

  assert.deepEqual(await reconcileIndexItems(env, existing, [record]), { indexed: 1, unchanged: 0, pending: 0, deleted: 0 })
  assert.deepEqual(uploads, [{ key: record.key, content: indexItemPayload(record).content, hash: indexItemPayload(record).contentHash }])

  uploads.length = 0
  existing[0]!.metadata.content_hash = indexItemPayload(record).contentHash
  assert.deepEqual(await reconcileIndexItems(env, existing, [record]), { indexed: 0, unchanged: 1, pending: 0, deleted: 0 })
  assert.deepEqual(uploads, [])
})

test('an unchanged skipped item reports its indexing failure', async () => {
  const { env, uploads } = provider()
  await assert.rejects(
    reconcileIndexItems(env, [{
      id: 'item-1', key: record.key, status: 'skipped',
      metadata: { content_hash: indexItemPayload(record).contentHash },
      error: 'unsupported content',
    }], [record]),
    /AI Search skipped unchanged item.*unsupported content/,
  )
  assert.deepEqual(uploads, [])
})
