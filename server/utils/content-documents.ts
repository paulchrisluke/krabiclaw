import { execute, executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '../db/index.ts'

export type ContentDocumentOwnerType = 'platform_blog' | 'platform_doc' | 'tenant_blog'
export type ContentBlockType = 'heading' | 'markdown' | 'image' | 'gallery' | 'faq' | 'how_to' | 'divider' | 'ai_assistance' | 'cta' | 'callout'

export interface ContentDocumentRow {
  id: string
  owner_type: ContentDocumentOwnerType
  owner_id: string
  draft_revision_id: string | null
  published_revision_id: string | null
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

export interface ContentRevisionRow {
  id: string
  document_id: string
  snapshot_json: string
  body_markdown: string
  created_by: string | null
  label: string | null
  created_at: string
}

export interface ContentBlockSnapshot {
  id: string
  parent_block_id: string | null
  type: ContentBlockType
  position: number
  level: number | null
  data: Record<string, unknown>
}

export interface ContentBlockInput {
  id?: string
  type: ContentBlockType
  data: Record<string, unknown>
  parent_block_id?: string | null
  level?: number | null
  position?: number | null
}

type ContentBlockWriteInput = Omit<ContentBlockSnapshot, 'id'> & { id?: string; updated_at?: string | null }

const VALID_BLOCK_TYPES: readonly ContentBlockType[] = ['heading', 'markdown', 'image', 'gallery', 'faq', 'how_to', 'divider', 'ai_assistance', 'cta', 'callout']
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/

function badRequest(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message })
}

function notFound(message: string): never {
  throw createError({ statusCode: 404, statusMessage: message })
}

function assertBlockType(type: string): ContentBlockType {
  if (!VALID_BLOCK_TYPES.includes(type as ContentBlockType)) {
    badRequest(`content block type must be one of: ${VALID_BLOCK_TYPES.join(', ')}`)
  }
  return type as ContentBlockType
}

function asObject(value: unknown, field: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) badRequest(`${field} must be an object`)
  return value as Record<string, unknown>
}

function parseBlockData(row: Pick<ContentBlockRow, 'data_json' | 'id' | 'type'>) {
  try {
    return asObject(JSON.parse(row.data_json) as unknown, `content block ${row.id} data`)
  } catch (error) {
    throw createError({
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
        data: { markdown },
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
      data: { markdown: '' },
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
    `SELECT id, owner_type, owner_id, draft_revision_id, published_revision_id, created_at, updated_at
     FROM content_documents
     WHERE owner_type = ? AND owner_id = ?
     LIMIT 1`,
    [ownerType, ownerId],
  )
}

export async function getContentDocumentById(db: DbClient, documentId: string) {
  return await queryFirst<ContentDocumentRow | null>(
    db,
    `SELECT id, owner_type, owner_id, draft_revision_id, published_revision_id, created_at, updated_at
     FROM content_documents
     WHERE id = ?
     LIMIT 1`,
    [documentId],
  )
}

export async function ensureContentDocument(db: D1Database, ownerType: ContentDocumentOwnerType, ownerId: string) {
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
    draft_revision_id: null,
    published_revision_id: null,
    created_at: now,
    updated_at: now,
  }
}

// Every call rewrites the document's entire content_blocks set and stores a
// full block snapshot on content_revisions, even for a single-block edit.
// That's O(n) per write in a document's block count and revision history
// size; intentional for now since documents are short-form (blog/doc posts,
// not full books) and it keeps the optimistic-concurrency story in this file
// simple (one guarded delete+reinsert instead of per-block diffing). Revisit
// with per-block writes/diffed revisions if documents grow large enough for
// this to matter.
async function writeRevisionFromBlocks(
  db: D1Database,
  document: ContentDocumentRow,
  blocks: ContentBlockWriteInput[],
  opts: {
    bodyMarkdown?: string
    createdBy?: string | null
    label?: string | null
    publish?: boolean
    expectedBlock?: { id: string; updatedAt: string }
    additionalQueriesBefore?: BatchQuery[]
    additionalQueriesAfter?: BatchQuery[]
  } = {},
) {
  const now = new Date().toISOString()
  const revisionId = crypto.randomUUID()
  const snapshots: Array<ContentBlockSnapshot & { updated_at: string }> = blocks.map((block, index) => ({
    id: block.id ?? crypto.randomUUID(),
    parent_block_id: block.parent_block_id ?? null,
    type: assertBlockType(block.type),
    position: typeof block.position === 'number' ? block.position : index,
    level: block.level ?? null,
    data: asObject(block.data, `content block ${index} data`),
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

  const queries: { query: string; params: unknown[] }[] = [
    ...(opts.additionalQueriesBefore ?? []).map(query => ({ query: query.query, params: query.params ?? [] })),
    deleteBlocksQuery,
    ...snapshots.map(block => ({
      query: `INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        block.id,
        document.id,
        block.parent_block_id,
        block.type,
        block.position,
        block.level,
        JSON.stringify(block.data),
        now,
        block.updated_at,
      ],
    })),
    ...guardCollisionQueries,
    {
      query: `INSERT INTO content_revisions (id, document_id, snapshot_json, body_markdown, created_by, label, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [revisionId, document.id, JSON.stringify({ blocks: snapshots }), bodyMarkdown, opts.createdBy ?? null, opts.label ?? null, now],
    },
    {
      query: opts.publish
        ? 'UPDATE content_documents SET draft_revision_id = ?, published_revision_id = ?, updated_at = ? WHERE id = ?'
        : 'UPDATE content_documents SET draft_revision_id = ?, updated_at = ? WHERE id = ?',
      params: opts.publish
        ? [revisionId, revisionId, now, document.id]
        : [revisionId, now, document.id],
    },
    ...(opts.additionalQueriesAfter ?? []).map(query => ({ query: query.query, params: query.params ?? [] })),
  ]

  try {
    await executeBatch(db, queries)
  } catch (error) {
    if (opts.expectedBlock) {
      throw createError({ statusCode: 409, statusMessage: 'Content block was updated by another writer', cause: error })
    }
    throw error
  }

  return { revision_id: revisionId, body_markdown: bodyMarkdown, blocks: snapshots }
}

export async function syncContentDocumentFromMarkdown(
  db: D1Database,
  opts: {
    ownerType: ContentDocumentOwnerType
    ownerId: string
    bodyMarkdown: string
    createdBy?: string | null
    label?: string | null
    publish?: boolean
  },
) {
  const document = await ensureContentDocument(db, opts.ownerType, opts.ownerId)

  // Markdown only ever encodes heading/markdown blocks, but writeRevisionFromBlocks
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

  const revision = await writeRevisionFromBlocks(db, document, blocks, {
    bodyMarkdown: opts.bodyMarkdown,
    createdBy: opts.createdBy,
    label: opts.label,
    publish: opts.publish,
  })
  return { document, ...revision }
}

export async function syncContentDocumentFromBlocks(
  db: D1Database,
  opts: {
    ownerType: ContentDocumentOwnerType
    ownerId: string
    blocks: ContentBlockInput[]
    createdBy?: string | null
    label?: string | null
    publish?: boolean
  },
) {
  const document = await ensureContentDocument(db, opts.ownerType, opts.ownerId)
  const revision = await writeRevisionFromBlocks(db, document, opts.blocks.map((block, index) => ({
    id: block.id,
    parent_block_id: block.parent_block_id ?? null,
    type: block.type,
    position: index,
    level: block.level ?? null,
    data: block.data,
  })), {
    createdBy: opts.createdBy,
    label: opts.label,
    publish: opts.publish,
  })
  return { document, ...revision }
}

export async function publishCurrentContentRevision(db: D1Database, ownerType: ContentDocumentOwnerType, ownerId: string) {
  const document = await getContentDocumentByOwner(db, ownerType, ownerId)
  if (!document?.draft_revision_id) return null
  const revision = await queryFirst<Pick<ContentRevisionRow, 'body_markdown'> | null>(
    db,
    'SELECT body_markdown FROM content_revisions WHERE id = ? AND document_id = ? LIMIT 1',
    [document.draft_revision_id, document.id],
  )
  if (!revision) notFound('Content revision not found')
  const now = new Date().toISOString()
  const queries: { query: string; params: unknown[] }[] = [{
    query: 'UPDATE content_documents SET published_revision_id = ?, updated_at = ? WHERE id = ?',
    params: [document.draft_revision_id, now, document.id],
  }]
  if (ownerType === 'platform_blog' || ownerType === 'tenant_blog') {
    queries.push({
      query: 'UPDATE blog_posts SET body = ?, updated_at = ? WHERE id = ?',
      params: [revision.body_markdown, now, ownerId],
    })
  } else {
    queries.push({
      query: 'UPDATE platform_docs SET body = ?, updated_at = ? WHERE id = ?',
      params: [revision.body_markdown, now, ownerId],
    })
  }
  await executeBatch(db, queries)
  return { ...document, published_revision_id: document.draft_revision_id, updated_at: now }
}

export async function publishContentDocumentRevision(db: D1Database, documentId: string) {
  const document = await getContentDocumentById(db, documentId)
  if (!document) notFound('Content document not found')
  if (!document.draft_revision_id) badRequest('Content document has no draft revision')

  const revision = await queryFirst<Pick<ContentRevisionRow, 'id' | 'body_markdown'> | null>(
    db,
    `SELECT id, body_markdown
     FROM content_revisions
     WHERE id = ? AND document_id = ?
     LIMIT 1`,
    [document.draft_revision_id, document.id],
  )
  if (!revision) notFound('Content revision not found')

  const now = new Date().toISOString()
  const queries: { query: string; params: unknown[] }[] = [
    {
      query: 'UPDATE content_documents SET published_revision_id = ?, updated_at = ? WHERE id = ?',
      params: [revision.id, now, document.id],
    },
  ]

  if (document.owner_type === 'platform_blog' || document.owner_type === 'tenant_blog') {
    queries.push({
      query: `UPDATE blog_posts
        SET body = ?, status = 'published', published_at = COALESCE(published_at, ?), updated_at = ?
        WHERE id = ?`,
      params: [revision.body_markdown, now, now, document.owner_id],
    })
  } else if (document.owner_type === 'platform_doc') {
    queries.push({
      query: `UPDATE platform_docs
        SET body = ?, status = 'published', published_at = COALESCE(published_at, ?), updated_at = ?
        WHERE id = ?`,
      params: [revision.body_markdown, now, now, document.owner_id],
    })
  }

  await executeBatch(db, queries)
  return { success: true, document_id: document.id, revision_id: revision.id, body_markdown: revision.body_markdown }
}

export async function unpublishContentDocument(db: D1Database, ownerType: ContentDocumentOwnerType, ownerId: string) {
  const document = await getContentDocumentByOwner(db, ownerType, ownerId)
  if (!document) return null
  const now = new Date().toISOString()
  await execute(
    db,
    'UPDATE content_documents SET published_revision_id = NULL, updated_at = ? WHERE id = ?',
    [now, document.id],
  )
  return { ...document, published_revision_id: null, updated_at: now }
}

export async function deleteContentDocumentForOwner(db: D1Database, ownerType: ContentDocumentOwnerType, ownerId: string) {
  await execute(
    db,
    'DELETE FROM content_documents WHERE owner_type = ? AND owner_id = ?',
    [ownerType, ownerId],
  )
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

export async function getContentOutline(db: DbClient, documentId: string) {
  const blocks = await listBlocksForDocument(db, documentId)
  return blocks.map(formatBlockOutline)
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
  return { ...block, data: parseBlockData(block) }
}

async function listBlocksForDocument(db: DbClient, documentId: string) {
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
  db: D1Database,
  documentId: string,
  input: ContentBlockInput & { after_block_id?: string | null; createdBy?: string | null; label?: string | null },
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
  return await writeRevisionFromBlocks(db, document, snapshots, {
    createdBy: input.createdBy,
    label: input.label,
    expectedBlock: anchorBlock ? { id: anchorBlock.id, updatedAt: anchorBlock.updated_at } : undefined,
  })
}

export async function replaceContentBlock(
  db: D1Database,
  blockId: string,
  input: { data: Record<string, unknown>; expected_updated_at: string; createdBy?: string | null; label?: string | null },
) {
  const current = await getContentBlock(db, blockId)
  if (current.updated_at !== input.expected_updated_at) {
    throw createError({ statusCode: 409, statusMessage: 'Content block was updated by another writer' })
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

  return await writeRevisionFromBlocks(db, document, snapshots, {
    createdBy: input.createdBy,
    label: input.label,
    expectedBlock: { id: blockId, updatedAt: input.expected_updated_at },
  })
}

export async function deleteContentBlock(
  db: D1Database,
  blockId: string,
  input: { expected_updated_at: string; createdBy?: string | null; label?: string | null },
) {
  const current = await getContentBlock(db, blockId)
  if (current.updated_at !== input.expected_updated_at) {
    throw createError({ statusCode: 409, statusMessage: 'Content block was updated by another writer' })
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

  return await writeRevisionFromBlocks(db, document, snapshots, {
    createdBy: input.createdBy,
    label: input.label,
    expectedBlock: { id: blockId, updatedAt: input.expected_updated_at },
  })
}

export async function renderContentPreview(db: DbClient, documentId: string) {
  const blocks = await listBlocksForDocument(db, documentId)
  return { body_markdown: renderContentBlocksToMarkdown(blocks), blocks: blocks.map(formatBlockOutline) }
}

/** Editor-oriented snapshot read. Unknown/future block types remain opaque data
 * so a client can round-trip them without becoming a second content system. */
export async function getContentEditorSnapshot(db: DbClient, ownerType: ContentDocumentOwnerType, ownerId: string) {
  const document = await getContentDocumentByOwner(db, ownerType, ownerId)
  if (!document) return null
  const blocks = await listBlocksForDocument(db, document.id)
  return { document, blocks: blocks.map(formatBlockOutline) }
}

export async function getPublishedContentSnapshot(db: DbClient, ownerType: ContentDocumentOwnerType, ownerId: string) {
  const row = await queryFirst<{ snapshot_json: string } | null>(db, `
    SELECT r.snapshot_json
      FROM content_documents d
      JOIN content_revisions r ON r.id = d.published_revision_id
     WHERE d.owner_type = ? AND d.owner_id = ?
     LIMIT 1
  `, [ownerType, ownerId])
  if (!row) return null
  try {
    const parsed = JSON.parse(row.snapshot_json) as { blocks?: ContentBlockSnapshot[] }
    return Array.isArray(parsed.blocks) ? parsed.blocks : null
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'Published content revision is malformed' })
  }
}

export async function replaceContentDocumentBlocks(
  db: D1Database,
  ownerType: ContentDocumentOwnerType,
  ownerId: string,
  blocks: ContentBlockInput[],
  opts: { expected_document_updated_at: string; createdBy?: string | null; label?: string | null; publish?: boolean; additionalQueriesBefore?: BatchQuery[]; additionalQueriesAfter?: BatchQuery[] },
) {
  const document = await getContentDocumentByOwner(db, ownerType, ownerId)
  if (!document) notFound('Content document not found')
  if (document.updated_at !== opts.expected_document_updated_at) {
    throw createError({ statusCode: 409, statusMessage: 'Content document was updated by another writer' })
  }
  const existing = await listBlocksForDocument(db, document.id)
  // Use a real existing block as the atomic D1 guard. Empty documents cannot
  // race after their timestamp was checked because every canonical document
  // is created with at least one Markdown block.
  const anchor = existing[0]
  if (!anchor) throw createError({ statusCode: 409, statusMessage: 'Content document changed; reload before saving' })
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
  return await writeRevisionFromBlocks(db, document, snapshots, {
    createdBy: opts.createdBy,
    label: opts.label ?? 'Editor autosave',
    publish: opts.publish,
    expectedBlock: { id: anchor.id, updatedAt: anchor.updated_at },
    additionalQueriesBefore: opts.additionalQueriesBefore,
    additionalQueriesAfter: opts.additionalQueriesAfter,
  })
}

export interface LegacyBlogBackfillFinding {
  post_id: string
  component_id: string
  type: 'faq' | 'how_to'
  action: 'insert' | 'skip_existing' | 'malformed' | 'unmatched_placeholder' | 'duplicate'
  detail?: string
}

const LEGACY_COMPONENT_PLACEHOLDER_RE = /\{\{\s*component\s+type\s*=\s*(?:"([^"]+)"|'([^']+)'|([a-zA-Z0-9_-]+))\s*\}\}/g

export function mergeLegacyBlogComponents(
  sourceBlocks: ContentBlockInput[],
  components: Array<{ component_id: string; type: 'faq' | 'how_to'; position: number; data: Record<string, unknown> }>,
) {
  const findings: LegacyBlogBackfillFinding[] = []
  const remaining = [...components].sort((a, b) => a.position - b.position)
  const canonicalTypes = new Set(sourceBlocks.filter(block => block.type === 'faq' || block.type === 'how_to').map(block => block.type))
  const blocks: ContentBlockInput[] = []

  for (const block of sourceBlocks) {
    if (block.type !== 'markdown' || typeof block.data.markdown !== 'string') { blocks.push(block); continue }
    const markdown = block.data.markdown
    let cursor = 0
    for (const match of markdown.matchAll(LEGACY_COMPONENT_PLACEHOLDER_RE)) {
      const index = match.index ?? 0
      const prose = markdown.slice(cursor, index)
      if (prose.trim()) blocks.push({ ...block, id: cursor === 0 ? block.id : undefined, data: { ...block.data, markdown: prose } })
      const rawType = match[1] ?? match[2] ?? match[3] ?? ''
      const type = rawType === 'faq' || rawType === 'how_to' ? rawType : null
      const componentIndex = type ? remaining.findIndex(component => component.type === type) : -1
      if (componentIndex < 0 || !type) {
        findings.push({ post_id: '', component_id: '', type: type ?? 'faq', action: 'unmatched_placeholder', detail: `No valid legacy component matched ${rawType || 'unknown'}` })
        blocks.push({ type: 'markdown', data: { markdown: match[0] } })
      } else {
        const [component] = remaining.splice(componentIndex, 1)
        if (canonicalTypes.has(type)) findings.push({ post_id: '', component_id: component!.component_id, type, action: 'duplicate', detail: 'Canonical block of this type already exists' })
        else {
          blocks.push({ type, data: component!.data })
          canonicalTypes.add(type)
          findings.push({ post_id: '', component_id: component!.component_id, type, action: 'insert', detail: 'Replaced body placeholder in place' })
        }
      }
      cursor = index + match[0].length
    }
    const trailing = markdown.slice(cursor)
    if (trailing.trim()) blocks.push({ ...block, id: cursor === 0 ? block.id : undefined, data: { ...block.data, markdown: trailing } })
  }

  for (const component of remaining) {
    if (canonicalTypes.has(component.type)) {
      findings.push({ post_id: '', component_id: component.component_id, type: component.type, action: 'duplicate', detail: 'Duplicate legacy component type' })
      continue
    }
    const position = Math.max(0, Math.min(blocks.length, component.position))
    blocks.splice(position, 0, { type: component.type, data: component.data })
    canonicalTypes.add(component.type)
    findings.push({ post_id: '', component_id: component.component_id, type: component.type, action: 'insert', detail: 'Inserted at legacy position because no placeholder existed' })
  }
  return { blocks: blocks.map((block, position) => ({ ...block, position })), findings }
}

/** Idempotent migration/report for the old blog component authoring surface.
 * Dry-run is the default; apply writes only missing FAQ/How-To block types and
 * never removes legacy/unknown blocks. Compatibility component rows remain
 * readable until all external consumers have migrated. */
export async function backfillLegacyBlogStructuredBlocks(
  db: D1Database,
  opts: { apply?: boolean; siteId?: string | null } = {},
) {
  const rows = await queryAll<{
    post_id: string
    site_id: string | null
    body: string
    component_id: string
    type: string
    position: number
    data_json: string
  }>(db, `
    SELECT p.id AS post_id, p.site_id, p.body, c.id AS component_id, c.type, c.position, c.data_json
      FROM blog_posts p
      JOIN platform_content_components c ON c.content_type = 'blog_post' AND c.content_id = p.id
     WHERE c.type IN ('faq', 'how_to')
       ${opts.siteId === undefined ? '' : opts.siteId === null ? 'AND p.site_id IS NULL' : 'AND p.site_id = ?'}
     ORDER BY p.id, c.position, c.created_at
  `, typeof opts.siteId === 'string' ? [opts.siteId] : [])

  const findings: LegacyBlogBackfillFinding[] = []
  const grouped = new Map<string, typeof rows>()
  for (const row of rows ?? []) grouped.set(row.post_id, [...(grouped.get(row.post_id) ?? []), row])

  for (const [postId, components] of grouped) {
    const first = components[0]!
    const ownerType: ContentDocumentOwnerType = first.site_id ? 'tenant_blog' : 'platform_blog'
    let snapshot = await getContentEditorSnapshot(db, ownerType, postId)
    if (!snapshot && opts.apply) {
      await syncContentDocumentFromMarkdown(db, { ownerType, ownerId: postId, bodyMarkdown: first.body, label: 'Legacy structured-content backfill' })
      snapshot = await getContentEditorSnapshot(db, ownerType, postId)
    }
    const sourceBlocks = (snapshot?.blocks ?? markdownToContentBlocks(first.body)) as Array<ContentBlockInput & { id?: string }>
    const blocks: ContentBlockInput[] = sourceBlocks.map(block => ({
      ...(block.id ? { id: block.id } : {}), type: block.type, data: block.data,
      parent_block_id: block.parent_block_id, level: block.level, position: block.position,
    }))
    const validComponents: Array<{ component_id: string; type: 'faq' | 'how_to'; position: number; data: Record<string, unknown> }> = []
    for (const component of components) {
      const type = component.type as 'faq' | 'how_to'
      let data: Record<string, unknown>
      try {
        data = asObject(JSON.parse(component.data_json), `legacy component ${component.component_id} data`)
      } catch {
        findings.push({ post_id: postId, component_id: component.component_id, type, action: 'malformed', detail: 'Malformed data_json' })
        continue
      }
      const required = type === 'faq' ? data.items : data.steps
      if (!Array.isArray(required) || required.length === 0) {
        findings.push({ post_id: postId, component_id: component.component_id, type, action: 'malformed', detail: `Missing ${type === 'faq' ? 'items' : 'steps'}` })
        continue
      }
      validComponents.push({ component_id: component.component_id, type, position: component.position, data })
    }
    const merged = mergeLegacyBlogComponents(blocks, validComponents)
    blocks.splice(0, blocks.length, ...merged.blocks)
    findings.push(...merged.findings.map(finding => ({ ...finding, post_id: postId })))

    if (opts.apply && snapshot && findings.some(finding => finding.post_id === postId && finding.action === 'insert')) {
      await replaceContentDocumentBlocks(db, ownerType, postId, blocks, {
        expected_document_updated_at: snapshot.document.updated_at,
        label: 'Legacy FAQ/How-To backfill',
      })
    }
  }
  return {
    apply: Boolean(opts.apply),
    findings,
    totals: {
      insert: findings.filter(f => f.action === 'insert').length,
      skip_existing: findings.filter(f => f.action === 'skip_existing').length,
      malformed: findings.filter(f => f.action === 'malformed').length,
      unmatched_placeholder: findings.filter(f => f.action === 'unmatched_placeholder').length,
      duplicate: findings.filter(f => f.action === 'duplicate').length,
    },
  }
}
