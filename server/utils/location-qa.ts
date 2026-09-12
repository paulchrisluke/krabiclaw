import { FAQ_BLOCK_SOURCES, type FaqBlockSource } from '~/shared/faq-block'
import { getPersistedSourceLocale } from '~/server/utils/localization'
import { createContentDocumentWithBlocks, prepareContentDocumentDeletion } from '~/server/utils/content/documents'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '../db/index.ts'
import { d1JsonStringSet } from '../db/d1-limits.ts'

export interface QaScope {
  organizationId: string
  siteId: string
  locationId: string | null
  pagePath?: string | null
}

export interface CreateQaInput {
  question: string
  answer?: string | null
  question_author?: string | null
  is_owner_answer?: boolean
  sort_order?: number
  source?: 'manual' | 'import'
  status?: 'published' | 'hidden'
}

export interface UpdateQaInput {
  question?: unknown
  answer?: unknown
  question_author?: unknown
  is_owner_answer?: unknown
  status?: unknown
  sort_order?: unknown
}

export interface QaDocument {
  id: string
  organization_id: string
  site_id: string
  location_id: string | null
  page_path: string | null
  question: string
  question_author: string | null
  question_date: string | null
  answer: string | null
  answer_author: string | null
  answer_date: string | null
  is_owner_answer: number
  upvote_count: number
  source: string
  status: 'published' | 'hidden'
  sort_order: number
  created_at: string
  updated_at: string
}

function normalizePagePath(pagePath: string | null | undefined) {
  if (!pagePath) return null
  const normalized = `/${pagePath.trim().replace(/^\/+|\/+$/g, '')}`
  return normalized === '/' ? '/' : normalized
}

function scopeSql(locationId: string | null, pagePath?: string | null) {
  const normalizedPagePath = normalizePagePath(pagePath)
  return locationId === null
    ? normalizedPagePath
      ? { clause: 'location_id IS NULL AND scope_path = ?', params: [normalizedPagePath] as unknown[] }
      : { clause: 'location_id IS NULL AND scope_path IS NULL', params: [] as unknown[] }
    : { clause: 'location_id = ?', params: [locationId] as unknown[] }
}

function stringOrNull(value: unknown, maxLength: number) {
  if (value == null) return null
  const normalized = String(value).trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

/**
 * `qaId` addresses one record whatever its scope. A dashboard record has a URL
 * of its own — `/qa/<id>` — and cannot know the page it was filed under before
 * it has read it, so an id lookup replaces the scope clause rather than
 * narrowing it. Without an id this behaves exactly as before.
 */
export async function listQa(db: DbClient, siteId: string, locationId: string | null, publishedOnly = false, pagePath?: string | null, locale = 'en', qaId?: string | null) {
  const scope = qaId
    ? { clause: 'root.id = ?', params: [qaId] as unknown[] }
    : scopeSql(locationId, pagePath)
  return queryAll<QaDocument>(db, `
    SELECT p.id, p.organization_id, p.site_id, root.location_id, root.scope_path AS page_path,
      p.title AS question, p.summary AS answer, (root.metadata_json ->> '$.question_author') AS question_author,
      (root.metadata_json ->> '$.question_date') AS question_date, (root.metadata_json ->> '$.answer_author') AS answer_author,
      (root.metadata_json ->> '$.answer_date') AS answer_date, (root.metadata_json ->> '$.is_owner_answer') AS is_owner_answer,
      (root.metadata_json ->> '$.upvote_count') AS upvote_count, root.source, root.status, root.sort_order, p.created_at, p.updated_at
    FROM content_documents root JOIN content_documents p ON COALESCE(p.root_id,p.id) = root.id AND p.locale = ?
    WHERE root.row_role = 'root' AND root.kind = 'qa' AND root.site_id = ?
      AND ${scope.clause.replace(/\b(location_id|scope_path)\b/g, 'root.$1')}${publishedOnly ? " AND root.status = 'published'" : ''}
    ORDER BY root.sort_order, is_owner_answer DESC, upvote_count DESC, p.created_at
  `, [locale, siteId, ...scope.params])
}

export function faqBlockSource(block: { type: string; data: Record<string, unknown> }): FaqBlockSource | null {
  if (block.type !== 'faq') return null
  return FAQ_BLOCK_SOURCES.find(source => source === block.data.source) ?? null
}

/** The published records a FAQ block with `source` lists on `pagePath`. */
export function listFaqBlockQa(db: DbClient, siteId: string, pagePath: string, source: FaqBlockSource, locale = 'en') {
  return listQa(db, siteId, null, true, source === 'page_qa' ? pagePath : null, locale)
}

export function faqItems(rows: QaDocument[]) {
  return rows.map(row => ({ id: String(row.id), title: String(row.question), description: typeof row.answer === 'string' ? row.answer : undefined }))
}

/**
 * FAQ blocks hold no questions of their own: each lists the published Q&A
 * records its `source` names. Public readers attach those records here so every
 * surface renders the same items.
 */
export async function attachPageQa<T extends { type: string; data: Record<string, unknown> }>(
  db: DbClient, siteId: string, pagePath: string, blocks: T[], locale = 'en',
): Promise<T[]> {
  const sources = new Set(blocks.map(faqBlockSource).filter((source): source is FaqBlockSource => source !== null))
  if (!sources.size) return blocks
  const itemsBySource = new Map(await Promise.all([...sources].map(async source =>
    [source, faqItems(await listFaqBlockQa(db, siteId, pagePath, source, locale))] as const)))
  return blocks.map((block) => {
    const source = faqBlockSource(block)
    return source ? { ...block, data: { ...block.data, items: itemsBySource.get(source) } } : block
  })
}

export async function createQa(db: DbClient, scope: QaScope, input: CreateQaInput) {
  const question = input.question.trim()
  if (!question) return { status: 400, data: { error: 'question required' } }
  if (question.length > 500) return { status: 400, data: { error: 'question must be 500 characters or fewer' } }
  const answer = stringOrNull(input.answer, 2000)
  const status = input.status === 'hidden' ? 'hidden' : 'published'
  const source = input.source === 'import' ? 'import' : 'manual'
  const explicitSortOrder = input.sort_order === undefined ? null : Number(input.sort_order)
  if (explicitSortOrder !== null && !Number.isInteger(explicitSortOrder)) {
    return { status: 400, data: { error: 'sort_order must be an integer' } }
  }

  await getPersistedSourceLocale(db, scope.organizationId, scope.siteId)
  const id = crypto.randomUUID()
  const pagePath = scope.locationId === null ? normalizePagePath(scope.pagePath) : null
  const scoped = scopeSql(scope.locationId, pagePath)
  await createContentDocumentWithBlocks(db, {
    id, rowRole: 'root', kind: 'qa', locale: 'en', organizationId: scope.organizationId, siteId: scope.siteId,
    locationId: scope.locationId, scopePath: pagePath, status, source, sortOrder: explicitSortOrder ?? 0,
    title: question, summary: answer,
    metadata: { question_author: stringOrNull(input.question_author, 120),
      question_date: null, answer_author: null, answer_date: null,
      is_owner_answer: input.is_owner_answer === false ? 0 : 1, upvote_count: 0 },
  }, [], {
    additionalQueriesAfter: explicitSortOrder === null ? [{
      query: `UPDATE content_documents SET sort_order = (
        SELECT COALESCE(MAX(sort_order), -1) + 1 FROM content_documents
        WHERE row_role = 'root' AND kind = 'qa' AND organization_id = ? AND site_id = ? AND ${scoped.clause} AND id <> ?
      ) WHERE id = ?`,
      params: [scope.organizationId, scope.siteId, ...scoped.params, id, id],
    }] : [],
  })
  const inserted = await queryFirst<{ sort_order: number }>(db, 'SELECT sort_order FROM content_documents WHERE id = ?', [id])
  if (!inserted) throw new Error('Created Q&A document was not found')
  const sortOrder = inserted.sort_order

  return {
    status: 201,
    data: {
      id,
      question,
      answer,
      location_id: scope.locationId,
      page_path: pagePath,
      status,
      sort_order: sortOrder,
      // A newly created question has no votes yet. It is stated rather than
      // omitted: this is the same row shape the list returns, and the CMS
      // validates it as one.
      upvote_count: 0,
      created: true,
    },
  }
}

export async function updateQa(db: DbClient, scope: QaScope, qaId: string, updates: UpdateQaInput) {
  const sets = ['updated_at = ?']
  const params: unknown[] = [new Date().toISOString()]
  const contentPaths: string[] = []
  const contentValues: unknown[] = []
  if (updates.question !== undefined) {
    const question = String(updates.question ?? '').trim()
    if (!question) throw new Error('Question is required')
    sets.push('title = ?')
    params.push(question.slice(0, 500))
  }
  if (updates.answer !== undefined) {
    sets.push('summary = ?')
    params.push(stringOrNull(updates.answer, 2000))
  }
  if (updates.question_author !== undefined) {
    contentPaths.push('$.question_author', '?')
    contentValues.push(stringOrNull(updates.question_author, 120))
  }
  if (updates.is_owner_answer !== undefined) {
    contentPaths.push('$.is_owner_answer', '?')
    contentValues.push(updates.is_owner_answer === false || updates.is_owner_answer === 0 ? 0 : 1)
  }
  if (updates.status !== undefined) {
    const status = String(updates.status)
    if (!['published', 'hidden'].includes(status)) throw new Error('Invalid Q&A status')
    sets.push('status = ?')
    params.push(status)
  }
  if (updates.sort_order !== undefined) {
    const sortOrder = Number(updates.sort_order)
    if (!Number.isInteger(sortOrder)) throw new Error('sort_order must be an integer')
    sets.push('sort_order = ?')
    params.push(sortOrder)
  }
  if (contentPaths.length) {
    sets.push(`metadata_json = json_set(metadata_json, ${contentPaths.map((value, index) => index % 2 === 0 ? `'${value}'` : value).join(', ')})`)
    params.push(...contentValues)
  }
  if (sets.length === 1) throw new Error('No update fields provided')

  const scoped = scopeSql(scope.locationId, scope.pagePath)
  params.push(qaId, scope.organizationId, scope.siteId, ...scoped.params)
  const result = await execute(db, `
    UPDATE content_documents
    SET ${sets.join(', ')}
    WHERE row_role = 'root' AND kind = 'qa' AND id = ? AND organization_id = ? AND site_id = ? AND ${scoped.clause}
  `, params)
  if (!Number(result.meta.changes ?? 0)) throw new Error('Q&A not found')
  return { updated: true, qa_id: qaId }
}

export async function deleteQa(db: DbClient, scope: QaScope, qaId: string) {
  const scoped = scopeSql(scope.locationId, scope.pagePath)
  const params = [qaId, scope.organizationId, scope.siteId, ...scoped.params]
  const where = `row_role = 'root' AND kind = 'qa' AND id = ? AND organization_id = ? AND site_id = ? AND ${scoped.clause}`
  const document = await queryFirst<{ id: string }>(db, `SELECT id FROM content_documents WHERE ${where}`, params)
  if (!document) return { status: 404, data: { error: 'Q&A not found' } }
  const results = await executeBatch(db, prepareContentDocumentDeletion({ documentId: qaId, organizationId: scope.organizationId, siteId: scope.siteId }))
  if (!Number(results.at(-1)?.meta.changes ?? 0)) return { status: 404, data: { error: 'Q&A not found' } }
  return { status: 200, data: { qa_id: qaId, deleted: true } }
}

export async function reorderQa(
  db: DbClient,
  scope: QaScope,
  updates: Array<{ id: string; sort_order: number }>,
) {
  if (!updates.length || updates.some(update => !update.id || !Number.isInteger(update.sort_order))) {
    throw new Error('Q&A reorder requires ids with integer sort_order values')
  }
  if (new Set(updates.map(update => update.id)).size !== updates.length) {
    throw new Error('Q&A reorder ids must be distinct')
  }

  const scoped = scopeSql(scope.locationId, scope.pagePath)
  const validation = await queryFirst<{ valid_count: number }>(db, `
    SELECT COUNT(*) AS valid_count
    FROM content_documents
    WHERE row_role = 'root' AND kind = 'qa' AND id IN (SELECT value FROM json_each(?)) AND organization_id = ? AND site_id = ? AND ${scoped.clause}
  `, [d1JsonStringSet(updates.map(update => update.id)), scope.organizationId, scope.siteId, ...scoped.params])
  if (Number(validation?.valid_count ?? 0) !== updates.length) {
    throw new Error('Q&A reorder contains records outside the requested scope')
  }

  const now = new Date().toISOString()
  const results = await executeBatch(db, updates.map(update => ({
    query: `
      UPDATE content_documents
      SET sort_order = ?, updated_at = ?
      WHERE row_role = 'root' AND kind = 'qa' AND id = ? AND organization_id = ? AND site_id = ? AND ${scoped.clause}
    `,
    params: [update.sort_order, now, update.id, scope.organizationId, scope.siteId, ...scoped.params],
  })))
  const changed = results.reduce((sum, result) => sum + Number(result.meta.changes ?? 0), 0)
  if (changed !== updates.length) {
    throw new Error(`Q&A reorder failed: expected ${updates.length} item(s) to update but only ${changed} matched. Reload and try again.`)
  }
  return { updated: updates.length }
}

export const listLocationQa = (db: DbClient, siteId: string, locationId: string) => listQa(db, siteId, locationId)

export function createLocationQa(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locationId: string,
  input: CreateQaInput,
) {
  return createQa(db, { organizationId, siteId, locationId }, input)
}

export function deleteLocationQa(db: DbClient, siteId: string, locationId: string, qaId: string) {
  return queryFirst<{ organization_id: string }>(db, 'SELECT organization_id FROM sites WHERE id = ?', [siteId])
    .then(site => site
      ? deleteQa(db, { organizationId: site.organization_id, siteId, locationId }, qaId)
      : { status: 404, data: { error: 'Q&A not found' } })
}
