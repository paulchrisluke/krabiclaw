import { FAQ_BLOCK_SOURCES, type FaqBlockSource } from '~/shared/faq-block'
import { queryAll, type DbClient } from '../db/index.ts'

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

export async function listQa(db: DbClient, siteId: string, locationId: string | null, publishedOnly = false, pagePath?: string | null, locale = 'en') {
  const scope = scopeSql(locationId, pagePath)
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

export const listLocationQa = (db: DbClient, siteId: string, locationId: string) => listQa(db, siteId, locationId)
