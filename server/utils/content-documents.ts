import { HTTPError } from 'nitro';

import { execute, executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '../db/index.ts'
import { d1JsonStringSet } from '../db/d1-limits.ts'
import { assertNoEmbeddedMediaFields } from '../../utils/tenant-page-blocks.ts'
import {
  CONTENT_BLOCK_TYPES,
  type ContentBlockType,
  type ContentDocumentOwnerType,
} from '~/shared/content-registries'

export {
  CONTENT_BLOCK_TYPES,
  CONTENT_DOCUMENT_OWNER_TYPES,
  type ContentBlockType,
  type ContentDocumentOwnerType,
} from '~/shared/content-registries'

export interface ContentDocumentRow {
  id: string
  owner_type: ContentDocumentOwnerType
  owner_id: string
  created_at: string
  updated_at: string
}

export interface ContentBlockRow {
  id: string
  document_id: string
  parent_block_id: string | null
  type: ContentBlockType
  position: number
  level: number | null
  data_json: string
  created_at: string
  updated_at: string
}

export interface ContentBlockSnapshot {
  id: string
  parent_block_id: string | null
  type: ContentBlockType
  position: number
  level: number | null
  data: Record<string, unknown>
  media?: ContentBlockMedia[]
}

export interface ContentBlockMedia {
  asset_id: string
  slot: string
  sort_order?: number
  public_url?: string | null
  thumbnail_url?: string | null
  kind?: string | null
  alt_text?: string | null
  width?: number | null
  height?: number | null
}

export interface ContentBlockInput {
  id?: string
  type: ContentBlockType
  data: Record<string, unknown>
  media?: ContentBlockMedia[]
  parent_block_id?: string | null
  level?: number | null
  position?: number | null
}

type ContentBlockWriteInput = Omit<ContentBlockSnapshot, 'id'> & { id?: string; updated_at?: string | null }

interface ContentDocumentWriteOptions {
  bodyMarkdown?: string
  expectedBlock?: { id: string; updatedAt: string }
  expectedDocument?: { id: string; updatedAt: string }
  additionalQueriesBefore?: BatchQuery[]
  additionalQueriesAfter?: BatchQuery[]
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/

function badRequest(message: string): never {
  throw new HTTPError({ statusCode: 400, statusMessage: message })
}

function notFound(message: string): never {
  throw new HTTPError({ statusCode: 404, statusMessage: message })
}

function assertBlockType(type: string): ContentBlockType {
  if (!(CONTENT_BLOCK_TYPES as readonly string[]).includes(type)) {
    badRequest(`content block type must be one of: ${CONTENT_BLOCK_TYPES.join(', ')}`)
  }
  return type as ContentBlockType
}

function asObject(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) badRequest(`${field} must be an object`)
  return value as Record<string, unknown>
}

function mediaFreeBlockData(type: ContentBlockType, value: unknown, field: string) {
  const data = asObject(value, field)
  try {
    assertNoEmbeddedMediaFields(data, field)
  } catch (error) {
    badRequest(error instanceof Error ? error.message : `${field} contains embedded media`)
  }
  if (type === 'image' && 'url' in data) badRequest(`${field}.url must use a media placement`)
  return data
}

function parseBlockData(row: Pick<ContentBlockRow, 'data_json' | 'id' | 'type'>) {
  try {
    return asObject(JSON.parse(row.data_json) as unknown, `content block ${row.id} data`)
  } catch (error) {
    throw new HTTPError({
      statusCode: 500,
      statusMessage: `Content block ${row.id} has malformed data_json`,
      cause: error,
    })
  }
}

export function markdownToContentBlocks(bodyMarkdown: string): Array<Omit<ContentBlockSnapshot, 'id'>> {
  const lines = String(bodyMarkdown ?? '').replace(/\r/g, '').split('\n')
  const blocks: Array<Omit<ContentBlockSnapshot, 'id'>> = []
  let markdownLines: string[] = []

  function flushMarkdown() {
    const markdown = markdownLines.join('\n').trim()
    if (markdown) {
      blocks.push({
        parent_block_id: null,
        type: 'markdown',
        position: blocks.length,
        level: null,
        data: { markdown, editor_mode: 'source' },
      })
    }
    markdownLines = []
  }

  for (const line of lines) {
    const heading = HEADING_RE.exec(line)
    if (heading) {
      flushMarkdown()
      blocks.push({
        parent_block_id: null,
        type: 'heading',
        position: blocks.length,
        level: heading[1]?.length ?? 1,
        data: { text: heading[2]?.trim() ?? '', markdown: line.trim() },
      })
      continue
    }
    markdownLines.push(line)
  }
  flushMarkdown()

  if (!blocks.length) {
    blocks.push({
      parent_block_id: null,
      type: 'markdown',
      position: 0,
      level: null,
      data: { markdown: '', editor_mode: 'source' },
    })
  }

  return blocks.map((block, index) => ({ ...block, position: index }))
}

export function renderContentBlocksToMarkdown(blocks: Array<Pick<ContentBlockRow, 'type' | 'position' | 'level' | 'data_json' | 'id'>>) {
  const sections = [...blocks]
    .sort((a, b) => a.position - b.position)
    .map((block) => {
      const data = parseBlockData(block)
      if (block.type === 'heading') {
        const text = typeof data.text === 'string' ? data.text.trim() : ''
        if (!text) return ''
        const level = Math.max(1, Math.min(6, block.level ?? 2))
        return `${'#'.repeat(level)} ${text}`
      }
      if (block.type === 'markdown') {
        return typeof data.markdown === 'string' ? data.markdown.trim() : ''
      }
      if (block.type === 'divider') return '---'
      return `{{component type="${block.type}"}}`
    })
    .filter(Boolean)

  return sections.join('\n\n').trim()
}

export async function getContentDocumentByOwner(db: DbClient, ownerType: ContentDocumentOwnerType, ownerId: string) {
  return await queryFirst<ContentDocumentRow | null>(
    db,
    `SELECT id, owner_type, owner_id, created_at, updated_at
     FROM content_documents
     WHERE owner_type = ? AND owner_id = ?
     LIMIT 1`,
    [ownerType, ownerId],
  )
}

export async function getContentDocumentById(db: DbClient, documentId: string) {
  return await queryFirst<ContentDocumentRow | null>(
    db,
    `SELECT id, owner_type, owner_id, created_at, updated_at
     FROM content_documents
     WHERE id = ?
     LIMIT 1`,
    [documentId],
  )
}

export async function ensureContentDocument(db: DbClient, ownerType: ContentDocumentOwnerType, ownerId: string) {
  const existing = await getContentDocumentByOwner(db, ownerType, ownerId)
  if (existing) return existing

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  try {
    await execute(
      db,
      `INSERT INTO content_documents (id, owner_type, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, ownerType, ownerId, now, now],
    )
  } catch (error) {
    const raced = await getContentDocumentByOwner(db, ownerType, ownerId)
    if (raced) return raced
    throw error
  }

  return {
    id,
    owner_type: ownerType,
    owner_id: ownerId,
    created_at: now,
    updated_at: now,
  }
}

// Every call rewrites the document's complete block set. Documents are short,
// and the single guarded delete+reinsert keeps optimistic concurrency atomic.
function buildDocumentWriteBatch(
  document: ContentDocumentRow,
  blocks: ContentBlockWriteInput[],
  opts: ContentDocumentWriteOptions = {},
) {
  const now = new Date().toISOString()
  const snapshots: Array<ContentBlockSnapshot & { updated_at: string }> = blocks.map((block, index) => ({
    id: block.id ?? crypto.randomUUID(),
    parent_block_id: block.parent_block_id ?? null,
    type: assertBlockType(block.type),
    position: typeof block.position === 'number' ? block.position : index,
    level: block.level ?? null,
    data: mediaFreeBlockData(block.type, block.data, `content block ${index} data`),
    updated_at: block.updated_at ?? now,
  }))
  const bodyMarkdown = opts.bodyMarkdown ?? renderContentBlocksToMarkdown(snapshots.map(block => ({
    id: block.id,
    type: block.type,
    position: block.position,
    level: block.level,
    data_json: JSON.stringify(block.data),
  })))

  // The guard is folded into the DELETE's WHERE clause (rather than run as a
  // separate pre-batch UPDATE) so the check and the rewrite commit atomically:
  // if opts.expectedBlock no longer matches, this DELETE removes zero rows,
  // which makes every subsequent INSERT below collide on its (still-present)
  // primary key and abort the whole batch instead of silently overwriting it.
  const deleteBlocksQuery = opts.expectedBlock
    ? {
        query: `DELETE FROM content_blocks WHERE document_id = ? AND NOT EXISTS (
          SELECT 1 FROM content_blocks WHERE id = ? AND updated_at != ?
        )`,
        params: [document.id, opts.expectedBlock.id, opts.expectedBlock.updatedAt],
      }
    : {
        query: 'DELETE FROM content_blocks WHERE document_id = ?',
        params: [document.id],
      }

  // When the guarded block is being removed entirely (deleteContentBlock),
  // it has no corresponding INSERT below to collide on if the guard's DELETE
  // above failed to match, so nothing would abort the batch. Force a PK
  // collision to detect that case too: insert a throwaway row under the
  // guarded id (this only succeeds if the guard really did clear the old
  // row) and remove it again immediately after, all inside the same batch.
  const guardBlockPersists = !opts.expectedBlock || snapshots.some(block => block.id === opts.expectedBlock!.id)
  const guardCollisionQueries = opts.expectedBlock && !guardBlockPersists
    ? [
        {
          query: `INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
            VALUES (?, ?, NULL, 'markdown', 0, NULL, '{}', ?, ?)`,
          params: [opts.expectedBlock.id, document.id, now, opts.expectedBlock.updatedAt],
        },
        { query: 'DELETE FROM content_blocks WHERE id = ?', params: [opts.expectedBlock.id] },
      ]
    : []

  // Whole-document replacements use the document timestamp as their source
  // of truth. This INSERT is a no-op only while the exact token still exists;
  // a stale or deleted document attempts to insert an intentionally invalid
  // block type, tripping the CHECK constraint and rolling back the batch.
  // Unlike an anchor-block guard, it also closes the race where every old
  // block id was replaced between preflight and commit.
  const documentGuardQueries = opts.expectedDocument
    ? [{
        query: `INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
          SELECT ?, ?, NULL, '__content_document_concurrency_guard__', 0, NULL, '{}', ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM content_documents WHERE id = ? AND updated_at = ?)`,
        params: [crypto.randomUUID(), opts.expectedDocument.id, now, now, opts.expectedDocument.id, opts.expectedDocument.updatedAt],
      }]
    : []

  const retainedIds = snapshots.map(block => block.id)
  const stalePlacementQuery = retainedIds.length
    ? {
        query: `DELETE FROM media_placements WHERE owner_type = 'content_block' AND owner_id IN (
          SELECT id FROM content_blocks WHERE document_id = ? AND id NOT IN (SELECT value FROM json_each(?))
        )`,
        params: [document.id, d1JsonStringSet(retainedIds)],
      }
    : {
        query: `DELETE FROM media_placements WHERE owner_type = 'content_block' AND owner_id IN (SELECT id FROM content_blocks WHERE document_id = ?)`,
        params: [document.id],
      }
  const liveBlockQueries: { query: string; params: unknown[] }[] = [
    stalePlacementQuery,
    deleteBlocksQuery,
    ...snapshots.map(block => ({
      query: `INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [block.id, document.id, block.parent_block_id, block.type, block.position, block.level, JSON.stringify(block.data), now, block.updated_at],
    })),
    ...guardCollisionQueries,
  ]

  const queries: { query: string; params: unknown[] }[] = [
    ...(opts.additionalQueriesBefore ?? []).map(query => ({ query: query.query, params: query.params ?? [] })),
    ...documentGuardQueries,
    ...liveBlockQueries,
    {
      query: 'UPDATE content_documents SET updated_at = ? WHERE id = ?',
      params: [now, document.id],
    },
    ...(opts.additionalQueriesAfter ?? []).map(query => ({ query: query.query, params: query.params ?? [] })),
  ]

  return { queries, body_markdown: bodyMarkdown, blocks: snapshots }
}

async function writeDocumentBlocks(
  db: DbClient,
  document: ContentDocumentRow,
  blocks: ContentBlockWriteInput[],
  opts: ContentDocumentWriteOptions = {},
) {
  const prepared = buildDocumentWriteBatch(document, blocks, opts)
  try {
    await executeBatch(db, prepared.queries)
  } catch (error) {
    if (opts.expectedDocument) {
      const current = await getContentDocumentById(db, opts.expectedDocument.id)
      if (!current || current.updated_at !== opts.expectedDocument.updatedAt) {
        throw new HTTPError({ statusCode: 409, statusMessage: 'Content document was updated by another writer', cause: error })
      }
    }
    if (opts.expectedBlock) {
      throw new HTTPError({ statusCode: 409, statusMessage: 'Content block was updated by another writer', cause: error })
    }
    throw error
  }

  return {
    body_markdown: prepared.body_markdown,
    blocks: prepared.blocks,
  }
}

export async function syncContentDocumentFromMarkdown(
  db: DbClient,
  opts: {
    ownerType: ContentDocumentOwnerType
    ownerId: string
    bodyMarkdown: string
  },
) {
  const document = await ensureContentDocument(db, opts.ownerType, opts.ownerId)

  // Markdown only ever encodes heading/markdown blocks, but the document writer
  // replaces the document's entire block set. Carry forward any existing
  // structured blocks (image, gallery, faq, etc.) so a plain-markdown sync
  // doesn't delete content the block editor or MCP tools already built.
  const existingBlocks = await listBlocksForDocument(db, document.id)
  const preservedStructuredBlocks = existingBlocks
    .filter(block => block.type !== 'heading' && block.type !== 'markdown')
    .map(block => ({
      id: block.id,
      parent_block_id: block.parent_block_id,
      type: block.type,
      level: block.level,
      data: parseBlockData(block),
      updated_at: block.updated_at,
    }))

  const blocks = [...markdownToContentBlocks(opts.bodyMarkdown), ...preservedStructuredBlocks]
    .map((block, index) => ({ ...block, position: index }))

  const write = await writeDocumentBlocks(db, document, blocks, {
    bodyMarkdown: opts.bodyMarkdown,
  })
  const currentDocument = await getContentDocumentById(db, document.id)
  if (!currentDocument) throw new HTTPError({ statusCode: 500, statusMessage: 'Content document disappeared after synchronization' })
  return { document: currentDocument, ...write }
}

export function prepareContentDocumentWithBlocks(
  ownerType: ContentDocumentOwnerType,
  ownerId: string,
  blocks: ContentBlockInput[],
  opts: {
    documentId?: string
    bodyMarkdown?: string
    additionalQueriesBefore?: BatchQuery[]
    additionalQueriesAfter?: BatchQuery[]
  } = {},
) {
  const now = new Date().toISOString()
  const documentId = opts.documentId ?? crypto.randomUUID()
  const document: ContentDocumentRow = {
    id: documentId,
    owner_type: ownerType,
    owner_id: ownerId,
    created_at: now,
    updated_at: now,
  }
  const documentInsert: BatchQuery = {
    query: 'INSERT INTO content_documents (id, owner_type, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    params: [documentId, ownerType, ownerId, now, now],
  }
  const write = buildDocumentWriteBatch(document, blocks.map((block, index) => ({
    id: block.id,
    parent_block_id: block.parent_block_id ?? null,
    type: block.type,
    position: index,
    level: block.level ?? null,
    data: block.data,
  })), {
    bodyMarkdown: opts.bodyMarkdown,
    additionalQueriesBefore: [documentInsert, ...(opts.additionalQueriesBefore ?? [])],
    additionalQueriesAfter: opts.additionalQueriesAfter,
  })
  return { document, ...write }
}

// This never calls ensureContentDocument
// (which INSERTs standalone, outside any batch). It folds the content_documents
// INSERT into the same additionalQueriesBefore array as the caller's own
// owner-row INSERT (e.g. blog_posts), so the block writer's single
// executeBatch call becomes the entire create operation: document, owner row,
// and blocks all commit or all fail together. Use this whenever a
// content document needs to be created atomically alongside the row it belongs
// to — not for adding a document to an already-existing owner row.
export async function createContentDocumentWithBlocks(
  db: DbClient,
  ownerType: ContentDocumentOwnerType,
  ownerId: string,
  blocks: ContentBlockInput[],
  opts: {
    documentId?: string
    bodyMarkdown?: string
    additionalQueriesBefore?: BatchQuery[]
    additionalQueriesAfter?: BatchQuery[]
  } = {},
) {
  const prepared = prepareContentDocumentWithBlocks(ownerType, ownerId, blocks, opts)
  await executeBatch(db, prepared.queries)
  const currentDocument = await getContentDocumentById(db, prepared.document.id)
  if (!currentDocument) throw new HTTPError({ statusCode: 500, statusMessage: 'Content document disappeared after synchronization' })
  return {
    document: currentDocument,
    body_markdown: prepared.body_markdown,
    blocks: prepared.blocks,
  }
}

function formatBlockOutline(block: ContentBlockRow) {
  return {
    id: block.id,
    parent_block_id: block.parent_block_id,
    type: block.type,
    position: block.position,
    level: block.level,
    updated_at: block.updated_at,
    data: parseBlockData(block),
  }
}

async function attachContentBlockMedia(db: DbClient, documentId: string, blocks: ReturnType<typeof formatBlockOutline>[]) {
  const media = await queryAll<ContentBlockMedia & { owner_id: string }>(
    db,
    `SELECT mp.owner_id, mp.asset_id, mp.slot, mp.sort_order,
            ma.alt_text,
            ma.public_url, ma.thumbnail_url, ma.kind, ma.width, ma.height
       FROM media_placements mp
       JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
       JOIN content_blocks cb ON cb.id = mp.owner_id
      WHERE cb.document_id = ? AND mp.owner_type = 'content_block' AND mp.status = 'active'
      ORDER BY cb.position, mp.slot, mp.sort_order`,
    [documentId],
  ) ?? []
  const byBlock = new Map<string, ContentBlockMedia[]>()
  for (const item of media) {
    const items = byBlock.get(item.owner_id) ?? []
    const { owner_id: _ownerId, ...placement } = item
    items.push(placement)
    byBlock.set(item.owner_id, items)
  }
  return blocks.map(block => ({ ...block, media: byBlock.get(block.id) ?? [] }))
}

export async function getContentOutline(db: DbClient, documentId: string) {
  const blocks = await listBlocksForDocument(db, documentId)
  return await attachContentBlockMedia(db, documentId, blocks.map(formatBlockOutline))
}

export async function getContentBlock(db: DbClient, blockId: string) {
  const block = await queryFirst<ContentBlockRow | null>(
    db,
    `SELECT id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at
     FROM content_blocks
     WHERE id = ?
     LIMIT 1`,
    [blockId],
  )
  if (!block) notFound('Content block not found')
  const [outlined] = await attachContentBlockMedia(db, block.document_id, [formatBlockOutline(block)])
  return { ...block, data: outlined!.data, media: outlined!.media }
}

export async function listBlocksForDocument(db: DbClient, documentId: string) {
  return await queryAll<ContentBlockRow>(
    db,
    `SELECT id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at
     FROM content_blocks
     WHERE document_id = ?
     ORDER BY position ASC, created_at ASC`,
    [documentId],
  ) ?? []
}

export async function appendContentBlock(
  db: DbClient,
  documentId: string,
  input: ContentBlockInput & { after_block_id?: string | null },
) {
  const document = await getContentDocumentById(db, documentId)
  if (!document) notFound('Content document not found')

  const existing = await listBlocksForDocument(db, documentId)
  const afterIndex = input.after_block_id ? existing.findIndex(block => block.id === input.after_block_id) : existing.length - 1
  if (input.after_block_id && afterIndex === -1) badRequest('after_block_id was not found in this document')

  const newBlock: ContentBlockWriteInput = {
    parent_block_id: input.parent_block_id ?? null,
    type: assertBlockType(input.type),
    position: afterIndex + 1,
    level: input.level ?? null,
    data: asObject(input.data, 'content block data'),
  }
  const snapshots = [
    ...existing.slice(0, afterIndex + 1).map(block => ({
      id: block.id,
      parent_block_id: block.parent_block_id,
      type: block.type,
      position: block.position,
      level: block.level,
      data: parseBlockData(block),
      updated_at: block.updated_at,
    })),
    newBlock,
    ...existing.slice(afterIndex + 1).map(block => ({
      id: block.id,
      parent_block_id: block.parent_block_id,
      type: block.type,
      position: block.position,
      level: block.level,
      data: parseBlockData(block),
      updated_at: block.updated_at,
    })),
  ].map((block, index) => ({ ...block, position: index, updated_at: block.position === index ? block.updated_at : null }))

  // Anchor on the block we're inserting after (or the last block, when
  // appending to the end) so a concurrent edit to the existing content is
  // detected instead of silently overwritten. An empty document has nothing
  // to race against, so no guard is needed there.
  const anchorBlock = afterIndex >= 0 ? existing[afterIndex] : undefined
  return await writeDocumentBlocks(db, document, snapshots, {
    expectedBlock: anchorBlock ? { id: anchorBlock.id, updatedAt: anchorBlock.updated_at } : undefined,
  })
}

export async function replaceContentBlock(
  db: DbClient,
  blockId: string,
  input: { data: Record<string, unknown>; expected_updated_at: string },
) {
  const current = await getContentBlock(db, blockId)
  if (current.updated_at !== input.expected_updated_at) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Content block was updated by another writer' })
  }
  const document = await getContentDocumentById(db, current.document_id)
  if (!document) notFound('Content document not found')

  const snapshots = (await listBlocksForDocument(db, document.id)).map((block) => ({
    id: block.id,
    parent_block_id: block.parent_block_id,
    type: block.type,
    position: block.position,
    level: block.level,
    data: block.id === blockId ? asObject(input.data, 'content block data') : parseBlockData(block),
    updated_at: block.id === blockId ? null : block.updated_at,
  }))

  return await writeDocumentBlocks(db, document, snapshots, {
    expectedBlock: { id: blockId, updatedAt: input.expected_updated_at },
  })
}

export async function deleteContentBlock(
  db: DbClient,
  blockId: string,
  input: { expected_updated_at: string },
) {
  const current = await getContentBlock(db, blockId)
  if (current.updated_at !== input.expected_updated_at) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Content block was updated by another writer' })
  }
  const document = await getContentDocumentById(db, current.document_id)
  if (!document) notFound('Content document not found')

  const allBlocks = await listBlocksForDocument(db, document.id)

  // Cascade-delete descendants so removing a block never leaves a surviving
  // block pointing at a parent_block_id that no longer exists.
  const removedIds = new Set<string>([blockId])
  let addedDescendant = true
  while (addedDescendant) {
    addedDescendant = false
    for (const block of allBlocks) {
      if (block.parent_block_id && removedIds.has(block.parent_block_id) && !removedIds.has(block.id)) {
        removedIds.add(block.id)
        addedDescendant = true
      }
    }
  }

  const snapshots = allBlocks
    .filter(block => !removedIds.has(block.id))
    .map((block, index) => ({
      id: block.id,
      parent_block_id: block.parent_block_id,
      type: block.type,
      position: index,
      level: block.level,
      data: parseBlockData(block),
      updated_at: block.updated_at,
    }))

  return await writeDocumentBlocks(db, document, snapshots, {
    expectedBlock: { id: blockId, updatedAt: input.expected_updated_at },
  })
}

export async function renderContentPreview(db: DbClient, documentId: string) {
  const blocks = await listBlocksForDocument(db, documentId)
  return { body_markdown: renderContentBlocksToMarkdown(blocks), blocks: await attachContentBlockMedia(db, documentId, blocks.map(formatBlockOutline)) }
}

/** Editor-oriented snapshot read. Unknown/future block types remain opaque data
 * so a client can round-trip them without becoming a second content system. */
export async function getContentEditorSnapshot(db: DbClient, ownerType: ContentDocumentOwnerType, ownerId: string) {
  const document = await getContentDocumentByOwner(db, ownerType, ownerId)
  if (!document) return null
  return await getContentEditorSnapshotForDocument(db, document)
}

export async function getContentEditorSnapshotForDocument(db: DbClient, document: ContentDocumentRow) {
  const blocks = await listBlocksForDocument(db, document.id)
  return { document, blocks: await attachContentBlockMedia(db, document.id, blocks.map(formatBlockOutline)) }
}

export async function getContentBlocksForOwner(db: DbClient, ownerType: ContentDocumentOwnerType, ownerId: string) {
  const document = await getContentDocumentByOwner(db, ownerType, ownerId)
  if (!document) return null
  const blocks = await listBlocksForDocument(db, document.id)
  return await attachContentBlockMedia(db, document.id, blocks.map(b => ({
    id: b.id,
    parent_block_id: b.parent_block_id,
    type: b.type,
    position: b.position,
    level: b.level,
    data: b.data_json ? JSON.parse(b.data_json) : {},
    created_at: b.created_at,
    updated_at: b.updated_at
  })))
}


export async function replaceContentDocumentBlocks(
  db: DbClient,
  ownerType: ContentDocumentOwnerType,
  ownerId: string,
  blocks: ContentBlockInput[],
  opts: { expected_document_updated_at: string; additionalQueriesBefore?: BatchQuery[]; additionalQueriesAfter?: BatchQuery[] },
) {
  const document = await getContentDocumentByOwner(db, ownerType, ownerId)
  if (!document) notFound('Content document not found')
  if (document.updated_at !== opts.expected_document_updated_at) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Content document was updated by another writer' })
  }
  const snapshots = blocks.map((block, index) => ({
    id: typeof (block as ContentBlockInput & { id?: unknown }).id === 'string'
      ? (block as ContentBlockInput & { id: string }).id
      : undefined,
    parent_block_id: block.parent_block_id ?? null,
    type: assertBlockType(block.type),
    position: index,
    level: block.level ?? null,
    data: asObject(block.data, `content block ${index} data`),
    updated_at: null,
  }))
  return await writeDocumentBlocks(db, document, snapshots, {
    expectedDocument: { id: document.id, updatedAt: opts.expected_document_updated_at },
    additionalQueriesBefore: opts.additionalQueriesBefore,
    additionalQueriesAfter: opts.additionalQueriesAfter,
  })
}

/**
 * Prepare a document replacement without doing any reads or writes.
 *
 * Bulk domain services use this to prefetch their documents once and compose
 * one atomic D1 batch for several owners. The expected timestamp is preserved
 * in the document guard so a concurrent writer still turns the batch into a
 * conflict instead of silently overwriting newer content.
 */
export function prepareContentDocumentBlocksReplacement(
  document: ContentDocumentRow,
  blocks: ContentBlockInput[],
  opts: {
    expected_document_updated_at: string
    additionalQueriesBefore?: BatchQuery[]
    additionalQueriesAfter?: BatchQuery[]
  },
) {
  if (document.updated_at !== opts.expected_document_updated_at) {
    throw new HTTPError({ statusCode: 409, statusMessage: 'Content document was updated by another writer' })
  }
  const snapshots = blocks.map((block, index) => ({
    id: typeof (block as ContentBlockInput & { id?: unknown }).id === 'string'
      ? (block as ContentBlockInput & { id: string }).id
      : undefined,
    parent_block_id: block.parent_block_id ?? null,
    type: assertBlockType(block.type),
    position: index,
    level: block.level ?? null,
    data: asObject(block.data, `content block ${index} data`),
    updated_at: null,
  }))
  return buildDocumentWriteBatch(document, snapshots, {
    expectedDocument: { id: document.id, updatedAt: opts.expected_document_updated_at },
    additionalQueriesBefore: opts.additionalQueriesBefore,
    additionalQueriesAfter: opts.additionalQueriesAfter,
  })
}
