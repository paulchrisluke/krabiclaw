import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '../db/index.ts'

export type ContentDocumentOwnerType = 'platform_blog' | 'platform_doc' | 'tenant_blog'
export type ContentBlockType = 'heading' | 'markdown' | 'image' | 'gallery' | 'faq' | 'how_to' | 'ai_assistance' | 'cta' | 'callout'

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
  type: ContentBlockType
  data: Record<string, unknown>
  parent_block_id?: string | null
  level?: number | null
  position?: number | null
}

type ContentBlockWriteInput = Omit<ContentBlockSnapshot, 'id'> & { id?: string; updated_at?: string | null }

const VALID_BLOCK_TYPES: readonly ContentBlockType[] = ['heading', 'markdown', 'image', 'gallery', 'faq', 'how_to', 'ai_assistance', 'cta', 'callout']
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

  if (opts.expectedBlock) {
    const guard = await execute(
      db,
      'UPDATE content_blocks SET updated_at = ? WHERE id = ? AND updated_at = ?',
      [now, opts.expectedBlock.id, opts.expectedBlock.updatedAt],
    )
    if (!Number(guard.meta.changes ?? 0)) {
      throw createError({ statusCode: 409, statusMessage: 'Content block was updated by another writer' })
    }
  }

  const queries: { query: string; params: unknown[] }[] = [
    {
      query: 'DELETE FROM content_blocks WHERE document_id = ?',
      params: [document.id],
    },
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
  ]

  await executeBatch(db, queries)
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
  const blocks = markdownToContentBlocks(opts.bodyMarkdown)
  const revision = await writeRevisionFromBlocks(db, document, blocks, {
    bodyMarkdown: opts.bodyMarkdown,
    createdBy: opts.createdBy,
    label: opts.label,
    publish: opts.publish,
  })
  return { document, ...revision }
}

export async function publishCurrentContentRevision(db: D1Database, ownerType: ContentDocumentOwnerType, ownerId: string) {
  const document = await getContentDocumentByOwner(db, ownerType, ownerId)
  if (!document?.draft_revision_id) return null
  const now = new Date().toISOString()
  await execute(
    db,
    'UPDATE content_documents SET published_revision_id = ?, updated_at = ? WHERE id = ?',
    [document.draft_revision_id, now, document.id],
  )
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

export async function getContentOutline(db: DbClient, documentId: string) {
  const blocks = await queryAll<ContentBlockRow>(
    db,
    `SELECT id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at
     FROM content_blocks
     WHERE document_id = ?
     ORDER BY position ASC, created_at ASC`,
    [documentId],
  )

  return (blocks ?? []).map(block => ({
    id: block.id,
    parent_block_id: block.parent_block_id,
    type: block.type,
    position: block.position,
    level: block.level,
    updated_at: block.updated_at,
    data: parseBlockData(block),
  }))
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

  return await writeRevisionFromBlocks(db, document, snapshots, { createdBy: input.createdBy, label: input.label })
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

  const snapshots = (await listBlocksForDocument(db, document.id))
    .filter(block => block.id !== blockId)
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
  return { body_markdown: renderContentBlocksToMarkdown(blocks), blocks: await getContentOutline(db, documentId) }
}
