import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '../db/index.ts'

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

function normalizePagePath(pagePath: string | null | undefined) {
  if (!pagePath) return null
  const normalized = `/${pagePath.trim().replace(/^\/+|\/+$/g, '')}`
  return normalized === '/' ? '/' : normalized
}

function scopeSql(locationId: string | null, pagePath?: string | null) {
  const normalizedPagePath = normalizePagePath(pagePath)
  return locationId === null
    ? normalizedPagePath
      ? { clause: 'location_id IS NULL AND page_path = ?', params: [normalizedPagePath] as unknown[] }
      : { clause: 'location_id IS NULL AND page_path IS NULL', params: [] as unknown[] }
    : { clause: 'location_id = ?', params: [locationId] as unknown[] }
}

function stringOrNull(value: unknown, maxLength: number) {
  if (value == null) return null
  const normalized = String(value).trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

export async function listQa(db: DbClient, siteId: string, locationId: string | null, publishedOnly = false, pagePath?: string | null) {
  const scope = scopeSql(locationId, pagePath)
  return await queryAll<Record<string, unknown>>(db, `
    SELECT id, organization_id, site_id, location_id, page_path, google_question_id, question,
           question_author, question_date, answer, answer_author, answer_date,
           is_owner_answer, upvote_count, source, status, sort_order, created_at, updated_at
    FROM location_qa
    WHERE site_id = ? AND ${scope.clause}${publishedOnly ? " AND status = 'published'" : ''}
    ORDER BY sort_order ASC, is_owner_answer DESC, upvote_count DESC, created_at ASC
  `, [siteId, ...scope.params])
}

export async function listPageQa(db: DbClient, siteId: string, pagePath: string, publishedOnly = false) {
  const scoped = await listQa(db, siteId, null, publishedOnly, pagePath)
  return scoped.length ? scoped : listQa(db, siteId, null, publishedOnly)
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

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const pagePath = scope.locationId === null ? normalizePagePath(scope.pagePath) : null
  const scoped = scopeSql(scope.locationId, pagePath)
  const params = [
    id,
    scope.organizationId,
    scope.siteId,
    scope.locationId,
    pagePath,
    question,
    stringOrNull(input.question_author, 120),
    answer,
    input.is_owner_answer === false ? 0 : 1,
    source,
    status,
    now,
    now,
  ]

  // When the caller doesn't pin an explicit sort_order (the common case —
  // appending a new question), compute "next" in the same INSERT statement
  // rather than reading the current max client-side first: two concurrent
  // creates reading-then-writing separately could compute the same max+1 and
  // collide, whereas a single INSERT...SELECT is atomic against that race.
  if (explicitSortOrder !== null) {
    await execute(db, `
      INSERT INTO location_qa (
        id, organization_id, site_id, location_id, page_path, question, question_author,
        answer, is_owner_answer, source, status, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [...params.slice(0, 11), explicitSortOrder, ...params.slice(11)])
  } else {
    await execute(db, `
      INSERT INTO location_qa (
        id, organization_id, site_id, location_id, page_path, question, question_author,
        answer, is_owner_answer, source, status, sort_order, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(MAX(sort_order), -1) + 1, ?, ?
      FROM location_qa
      WHERE organization_id = ? AND site_id = ? AND ${scoped.clause}
    `, [...params, scope.organizationId, scope.siteId, ...scoped.params])
  }
  const inserted = await queryFirst<{ sort_order: number }>(db, 'SELECT sort_order FROM location_qa WHERE id = ?', [id])
  const sortOrder = inserted?.sort_order ?? explicitSortOrder ?? 0

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
      created: true,
    },
  }
}

export async function updateQa(db: DbClient, scope: QaScope, qaId: string, updates: UpdateQaInput) {
  const sets = ['updated_at = ?']
  const params: unknown[] = [new Date().toISOString()]
  if (updates.question !== undefined) {
    const question = String(updates.question ?? '').trim()
    if (!question) throw new Error('Question is required')
    sets.push('question = ?')
    params.push(question.slice(0, 500))
  }
  if (updates.answer !== undefined) {
    sets.push('answer = ?')
    params.push(stringOrNull(updates.answer, 2000))
  }
  if (updates.question_author !== undefined) {
    sets.push('question_author = ?')
    params.push(stringOrNull(updates.question_author, 120))
  }
  if (updates.is_owner_answer !== undefined) {
    sets.push('is_owner_answer = ?')
    params.push(updates.is_owner_answer === false || updates.is_owner_answer === 0 ? 0 : 1)
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
  if (sets.length === 1) throw new Error('No update fields provided')

  const scoped = scopeSql(scope.locationId, scope.pagePath)
  params.push(qaId, scope.organizationId, scope.siteId, ...scoped.params)
  const result = await execute(db, `
    UPDATE location_qa
    SET ${sets.join(', ')}
    WHERE id = ? AND organization_id = ? AND site_id = ? AND ${scoped.clause}
  `, params)
  if (!Number(result.meta.changes ?? 0)) throw new Error('Q&A not found')
  return { updated: true, qa_id: qaId }
}

export async function deleteQa(db: DbClient, scope: QaScope, qaId: string) {
  const scoped = scopeSql(scope.locationId, scope.pagePath)
  const result = await execute(db, `
    DELETE FROM location_qa
    WHERE id = ? AND organization_id = ? AND site_id = ? AND ${scoped.clause}
  `, [qaId, scope.organizationId, scope.siteId, ...scoped.params])
  if (!Number(result.meta.changes ?? 0)) return { status: 404, data: { error: 'Q&A not found' } }
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
  const placeholders = updates.map(() => '?').join(', ')
  const validation = await queryFirst<{ valid_count: number }>(db, `
    SELECT COUNT(*) AS valid_count
    FROM location_qa
    WHERE id IN (${placeholders}) AND organization_id = ? AND site_id = ? AND ${scoped.clause}
  `, [...updates.map(update => update.id), scope.organizationId, scope.siteId, ...scoped.params])
  if (Number(validation?.valid_count ?? 0) !== updates.length) {
    throw new Error('Q&A reorder contains records outside the requested scope')
  }

  const now = new Date().toISOString()
  const results = await executeBatch(db, updates.map(update => ({
    query: `
      UPDATE location_qa
      SET sort_order = ?, updated_at = ?
      WHERE id = ? AND organization_id = ? AND site_id = ? AND ${scoped.clause}
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
