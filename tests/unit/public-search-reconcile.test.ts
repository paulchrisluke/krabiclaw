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

test('queued items without provider metadata stay pending while later keys upload', async () => {
  const { env, uploads } = provider()
  const later = { ...record, id: 'article-2', key: 'dashboard/org/article/2.md' }
  const queued = [{ id: 'item-1', key: record.key, status: 'queued' as const, metadata: null }]

  assert.deepEqual(await reconcileIndexItems(env, queued, [record, later], { maxUploads: 1 }),
    { indexed: 1, unchanged: 0, pending: 1, deleted: 0 })
  assert.deepEqual(uploads.map(item => item.key), [later.key])

  uploads.length = 0
  assert.deepEqual(await reconcileIndexItems(env, [
    { ...queued[0]!, status: 'running' as const },
    { id: 'item-2', key: later.key, status: 'queued' as const, metadata: null },
  ], [record, later]), { indexed: 0, unchanged: 0, pending: 2, deleted: 0 })
  assert.deepEqual(uploads, [])

  const oldHash = indexItemPayload({ ...record, body: 'Previous body' }).contentHash
  assert.deepEqual(await reconcileIndexItems(env, [
    { ...queued[0]!, status: 'running' as const, metadata: { content_hash: oldHash } },
    { id: 'item-2', key: later.key, status: 'completed' as const, metadata: { content_hash: indexItemPayload(later).contentHash } },
  ], [record, later]), { indexed: 1, unchanged: 1, pending: 0, deleted: 0 })
  assert.deepEqual(uploads.map(item => item.key), [record.key])
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
