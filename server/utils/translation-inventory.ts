import { tokensToCredits } from '~/server/utils/ai-credits'
import { getSourceLocale } from '~/server/utils/site-locales'
import { normalizeLocale } from '~/server/utils/site-i18n'
import { execute, executeBatch, queryAll, queryFirst, type BatchQuery, type DbClient } from '~/server/db'

export type TranslationEntityType = 'tenant_page' | 'menu' | 'menu_item' | 'business_location' | 'post'
export type TranslationScope = 'site' | 'content' | 'menus' | 'locations' | 'posts'
export type TranslationInventoryStatus = 'missing' | 'draft' | 'published' | 'stale'

export interface TranslationInventoryItem {
  entity_type: TranslationEntityType
  entity_id: string
  location_id: string | null
  page: string | null
  field: string
  label: string
  source_text: string
  source_fields: Record<string, string>
  source_hash: string
  source_chars: number
  translation_status: TranslationInventoryStatus
}

export interface TranslationEstimate {
  source_locale: string
  target_locale: string
  scope: TranslationScope
  total_items: number
  total_chars: number
  estimated_input_tokens: number
  estimated_output_tokens: number
  estimated_credits: number
  by_entity_type: Record<string, { items: number; chars: number }>
}

interface TranslationStateRow {
  entity_type: TranslationEntityType
  entity_id: string
  field: string
  source_hash: string | null
  status: TranslationInventoryStatus
}

type TextRecord = {
  entity_type: TranslationEntityType
  entity_id: string
  location_id?: string | null
  page?: string | null
  field: string
  label: string
  position?: number | null
  source_text?: string | null
  source_fields?: Record<string, string>
}

type TenantPageSourceBlock = {
  id: string
  parent_block_id?: string | null
  type: string
  position?: number
  level?: number | null
  data: Record<string, unknown>
}

type TenantPageStoredBlock = {
  id: string
  parent_block_id: string | null
  type: string
  position: number
  level: number | null
  data_json: string
}

type TenantPageStoredBlockWithData = TenantPageStoredBlock & {
  data: Record<string, unknown>
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim()
}

function compactFields(fields: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key, cleanText(value)] as const)
      .filter(([, value]) => value.length > 0)
  )
}

function fieldsToText(fields: Record<string, string>): string {
  return Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n')
}

function parseTenantPageBlocks(snapshotJson: string, label: string): TenantPageSourceBlock[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(snapshotJson)
  } catch {
    throw new Error(`${label} has malformed translation snapshot.`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} has malformed translation snapshot.`)
  const blocks = (parsed as { blocks?: unknown }).blocks
  if (!Array.isArray(blocks)) throw new Error(`${label} has malformed translation snapshot.`)
  return blocks.map((block, index) => {
    if (!block || typeof block !== 'object' || Array.isArray(block)) throw new Error(`${label} has malformed translation block ${index}.`)
    const candidate = block as Record<string, unknown>
    if (typeof candidate.id !== 'string' || typeof candidate.type !== 'string' || !candidate.data || typeof candidate.data !== 'object' || Array.isArray(candidate.data)) {
      throw new Error(`${label} has malformed translation block ${index}.`)
    }
    return {
      id: candidate.id,
      parent_block_id: typeof candidate.parent_block_id === 'string' ? candidate.parent_block_id : null,
      type: candidate.type,
      position: typeof candidate.position === 'number' ? candidate.position : index,
      level: typeof candidate.level === 'number' ? candidate.level : null,
      data: candidate.data as Record<string, unknown>,
    }
  })
}

function parseStoredBlock(row: TenantPageStoredBlock, label: string): TenantPageStoredBlockWithData {
  let data: unknown
  try { data = JSON.parse(row.data_json) } catch { throw new Error(`${label} block ${row.id} has malformed data.`) }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${label} block ${row.id} has malformed data.`)
  return { ...row, data: data as Record<string, unknown> }
}

async function reconcileTenantPageTranslationTopology(
  db: DbClient,
  organizationId: string,
  siteId: string,
  targetLocale: string,
  pageIds: string[],
) {
  for (const pageId of pageIds) {
    const source = await queryFirst<{ snapshot_json: string } | null>(db, `
      SELECT r.snapshot_json
        FROM tenant_page_variants v
        JOIN site_locales sl ON sl.site_id = v.site_id AND sl.locale = v.locale AND sl.is_source = 1
        JOIN content_documents d ON d.owner_type = 'tenant_page' AND d.owner_id = v.id
        JOIN content_revisions r ON r.id = d.published_revision_id AND r.document_id = d.id
       WHERE v.page_id = ? AND v.organization_id = ? AND v.site_id = ?
         AND v.status = 'published' AND v.published_revision_id IS NOT NULL
       LIMIT 1
    `, [pageId, organizationId, siteId])
    const target = await queryFirst<{
      variant_id: string
      document_id: string
      draft_revision_id: string | null
      document_updated_at: string
      snapshot_json: string
      body_markdown: string
    } | null>(db, `
      SELECT v.id AS variant_id, d.id AS document_id, d.draft_revision_id, d.updated_at AS document_updated_at,
             r.snapshot_json, r.body_markdown
        FROM tenant_page_variants v
        JOIN content_documents d ON d.owner_type = 'tenant_page' AND d.owner_id = v.id
        JOIN content_revisions r ON r.id = d.draft_revision_id AND r.document_id = d.id
       WHERE v.page_id = ? AND v.organization_id = ? AND v.site_id = ? AND v.locale = ?
       LIMIT 1
    `, [pageId, organizationId, siteId, targetLocale])
    if (!source || !target) continue

    const sourceBlocks = parseTenantPageBlocks(source.snapshot_json, `Source tenant page ${pageId}`)
    const storedBlocks = (await queryAll<TenantPageStoredBlock>(db, `
      SELECT id, parent_block_id, type, position, level, data_json
        FROM content_blocks
       WHERE document_id = ?
       ORDER BY position ASC, id ASC
    `, [target.document_id])).map(row => parseStoredBlock(row, `Translated tenant page ${pageId}`))
    const mappings = await queryAll<{ field: string; target_block_id: string | null }>(db, `
      SELECT field, target_block_id
        FROM tenant_page_translation_fields
       WHERE variant_id = ? AND target_block_id IS NOT NULL
    `, [target.variant_id])
    const mappedTargetId = new Map(mappings.map(row => [row.field, row.target_block_id!]))
    const targetById = new Map(storedBlocks.map(block => [block.id, block]))
    const targetByLineage = new Map(storedBlocks.flatMap(block => {
      const lineage = typeof block.data.source_block_id === 'string'
        ? block.data.source_block_id
        : null
      return lineage ? [[lineage, block] as const] : []
    }))
    const selectedTargetBlocks = new Map<string, TenantPageStoredBlockWithData | null>()
    const targetIdsBySourceId = new Map<string, string>()
    for (const sourceBlock of sourceBlocks) {
      const mapped = mappedTargetId.get(sourceBlock.id)
      const mappedBlock = mapped ? targetById.get(mapped) : undefined
      const mappedLineage = mappedBlock && typeof mappedBlock.data.source_block_id === 'string'
        ? mappedBlock.data.source_block_id
        : null
      const targetBlock = (mappedBlock && (!mappedLineage || mappedLineage === sourceBlock.id))
        ? mappedBlock
        : targetByLineage.get(sourceBlock.id)
      selectedTargetBlocks.set(sourceBlock.id, targetBlock ?? null)
      targetIdsBySourceId.set(sourceBlock.id, targetBlock?.id ?? crypto.randomUUID())
    }

    const nextBlocks: Array<{ id: string; parent_block_id: string | null; type: string; position: number; level: number | null; data: Record<string, unknown> }> = sourceBlocks.map(sourceBlock => {
      const targetBlock = selectedTargetBlocks.get(sourceBlock.id) ?? null
      const parentBlockId = sourceBlock.parent_block_id
        ? targetIdsBySourceId.get(sourceBlock.parent_block_id) ?? null
        : null
      const data = targetBlock
        ? { ...targetBlock.data, source_block_id: sourceBlock.id }
        : { ...sourceBlock.data, source_block_id: sourceBlock.id }
      return {
        id: targetIdsBySourceId.get(sourceBlock.id)!,
        parent_block_id: parentBlockId,
        type: sourceBlock.type,
        position: sourceBlock.position ?? 0,
        level: targetBlock?.level ?? sourceBlock.level ?? null,
        data,
      }
    })

    const currentShape = storedBlocks.map(block => `${block.id}:${block.type}:${block.position}:${block.data.source_block_id ?? ''}`).join('|')
    const nextShape = nextBlocks.map(block => `${block.id}:${block.type}:${block.position}:${block.data.source_block_id ?? ''}`).join('|')
    const mappingUpdates = sourceBlocks.flatMap(sourceBlock => {
      const existing = mappedTargetId.get(sourceBlock.id)
      const targetBlockId = targetIdsBySourceId.get(sourceBlock.id)
      return existing && targetBlockId && existing !== targetBlockId
        ? [{
            query: `UPDATE tenant_page_translation_fields
                       SET target_block_id = ?, updated_at = ?
                     WHERE variant_id = ? AND field = ? AND (target_block_id IS NULL OR target_block_id <> ?)`,
            params: [targetBlockId, new Date().toISOString(), target.variant_id, sourceBlock.id, targetBlockId],
          }]
        : []
    })
    if (currentShape === nextShape && !mappingUpdates.length) continue

    const revisionId = crypto.randomUUID()
    const snapshot = JSON.parse(target.snapshot_json) as Record<string, unknown>
    snapshot.blocks = nextBlocks
    const now = new Date().toISOString()
    const queries: BatchQuery[] = [
      {
        query: `INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
          SELECT ?, ?, NULL, '__content_document_concurrency_guard__', 0, NULL, '{}', ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM content_documents WHERE id = ? AND updated_at = ?)`,
        params: [crypto.randomUUID(), target.document_id, now, now, target.document_id, target.document_updated_at],
      },
    ]
    if (currentShape !== nextShape) {
      queries.push(
        { query: 'DELETE FROM content_blocks WHERE document_id = ?', params: [target.document_id] },
        ...nextBlocks.map(block => ({
          query: `INSERT INTO content_blocks (id, document_id, parent_block_id, type, position, level, data_json, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [block.id, target.document_id, block.parent_block_id, block.type, block.position, block.level, JSON.stringify(block.data), now, now],
        })),
        {
          query: 'INSERT INTO content_revisions (id, document_id, snapshot_json, body_markdown, created_by, label, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?)',
          params: [revisionId, target.document_id, JSON.stringify(snapshot), target.body_markdown, 'Reconciled translated tenant page topology', now],
        },
        {
          query: 'UPDATE content_documents SET draft_revision_id = ?, updated_at = ? WHERE id = ? AND updated_at = ?',
          params: [revisionId, now, target.document_id, target.document_updated_at],
        },
      )
    }
    queries.push(...mappingUpdates)
    await executeBatch(db, queries)
  }
}

function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / 3.5)
}

async function sourceHash(value: string): Promise<string> {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function shouldIncludeScope(scope: TranslationScope, entityType: TranslationEntityType): boolean {
  if (scope === 'site') return true
  if (scope === 'content') return entityType === 'tenant_page'
  if (scope === 'menus') return entityType === 'menu' || entityType === 'menu_item'
  if (scope === 'locations') return entityType === 'business_location'
  if (scope === 'posts') return entityType === 'post'
  return false
}

function inventoryItemStateKey(item: Pick<TranslationInventoryItem, 'entity_type' | 'entity_id' | 'field'>): string {
  return `${item.entity_type}:${item.entity_id}:${item.field}`
}

async function getTranslationStates(
  db: DbClient,
  organizationId: string,
  siteId: string,
  targetLocale: string,
): Promise<Map<string, TranslationStateRow>> {
  const rows: TranslationStateRow[] = []
  const queries = await Promise.all([
    queryAll<TranslationStateRow>(db, `
      SELECT 'tenant_page' AS entity_type, page_id AS entity_id,
             field, source_hash, status
      FROM tenant_page_translation_fields
      WHERE organization_id = ? AND site_id = ? AND locale = ?
    `, [organizationId, siteId, targetLocale]),
    queryAll<TranslationStateRow>(db, `
      SELECT 'menu' AS entity_type, menu_id AS entity_id, 'menu' AS field, source_hash, status
      FROM menu_translations
      WHERE organization_id = ? AND site_id = ? AND locale = ?
    `, [organizationId, siteId, targetLocale]),
    queryAll<TranslationStateRow>(db, `
      SELECT 'menu_item' AS entity_type, menu_item_id AS entity_id, 'item' AS field, source_hash, status
      FROM menu_item_translations
      WHERE organization_id = ? AND site_id = ? AND locale = ?
    `, [organizationId, siteId, targetLocale]),
    queryAll<TranslationStateRow>(db, `
      SELECT 'business_location' AS entity_type, location_id AS entity_id, 'location' AS field, source_hash, status
      FROM business_location_translations
      WHERE organization_id = ? AND site_id = ? AND locale = ?
    `, [organizationId, siteId, targetLocale]),
    queryAll<TranslationStateRow>(db, `
      SELECT 'post' AS entity_type, post_id AS entity_id, 'post' AS field, source_hash, status
      FROM post_translations
      WHERE organization_id = ? AND site_id = ? AND locale = ?
    `, [organizationId, siteId, targetLocale]),
  ])

  for (const query of queries) rows.push(...query)

  return new Map(rows.map(row => [inventoryItemStateKey(row), row]))
}

async function getSourceRecords(
  db: DbClient,
  organizationId: string,
  siteId: string,
): Promise<TextRecord[]> {
  const [pageRows, menuRows, itemRows, locationRows, postRows] = await Promise.all([
    queryAll<{ page_id: string; published_path: string; title: string; snapshot_json: string | null }>(db, `
      SELECT v.page_id, v.published_path, v.title, r.snapshot_json
      FROM tenant_page_variants v
      JOIN content_revisions r ON r.id = v.published_revision_id
      JOIN site_locales sl ON sl.site_id = v.site_id AND sl.locale = v.locale AND sl.is_source = 1
      WHERE v.organization_id = ? AND v.site_id = ? AND v.status = 'published'
      ORDER BY v.published_path
    `, [organizationId, siteId]),
    queryAll<Record<string, string | null>>(db, `
      SELECT id, location_id, name, description
      FROM menus
      WHERE organization_id = ? AND site_id = ? AND status = 'published'
      ORDER BY name
    `, [organizationId, siteId]),
    queryAll<Record<string, string | null>>(db, `
      SELECT mi.id, m.location_id, mi.name, mi.section, mi.description, mi.allergens, mi.ingredients, mi.dietary_notes, mi.preparation, mi.serving_note
      FROM menu_items mi
      JOIN menus m ON m.id = mi.menu_id
      WHERE m.organization_id = ? AND m.site_id = ? AND m.status = 'published'
      ORDER BY m.name, mi.sort_order, mi.name
    `, [organizationId, siteId]),
    queryAll<Record<string, string | null>>(db, `
      SELECT id, title, address, city, description, short_description
      FROM business_locations
      WHERE organization_id = ? AND site_id = ? AND status = 'active'
      ORDER BY is_primary DESC, title ASC
    `, [organizationId, siteId]),
    queryAll<Record<string, string | null>>(db, `
      SELECT id, location_id, title, body, event_title, offer_terms
      FROM posts
      WHERE organization_id = ? AND site_id = ? AND status != 'archived'
      ORDER BY updated_at DESC
    `, [organizationId, siteId]),
  ])

  const records: TextRecord[] = []

  for (const row of pageRows) {
    if (!row.snapshot_json) continue
    let snapshot: unknown
    try { snapshot = JSON.parse(row.snapshot_json) } catch { throw new Error(`Published tenant page ${row.page_id} has malformed translation snapshot.`) }
    const blocks = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) && Array.isArray((snapshot as { blocks?: unknown }).blocks)
      ? (snapshot as { blocks: Array<{ id?: unknown; type?: unknown; data?: unknown }> }).blocks
      : []
    const metadata = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) && (snapshot as { metadata?: unknown }).metadata && typeof (snapshot as { metadata: unknown }).metadata === 'object'
      ? (snapshot as { metadata: Record<string, unknown> }).metadata
      : {}
    for (const [field, value] of [
      ['title', metadata.title],
      ['summary', metadata.summary],
      ['seoTitle', metadata.seoTitle],
      ['seoDescription', metadata.seoDescription],
      ['canonicalUrl', metadata.canonicalUrl],
    ] as Array<[string, unknown]>) {
      const sourceFields = compactFields({ content: value })
      const text = fieldsToText(sourceFields)
      if (!text) continue
      records.push({
        entity_type: 'tenant_page',
        entity_id: row.page_id,
        location_id: null,
        page: row.published_path,
        field: `metadata.${field}`,
        label: `${row.title} ${field}`,
        source_text: text,
        source_fields: sourceFields,
      })
    }
    for (const [blockIndex, block] of blocks.entries()) {
      if (typeof block.id !== 'string' || !block.data || typeof block.data !== 'object' || Array.isArray(block.data)) continue
      const sourceFields = compactFields(Object.fromEntries(Object.entries(block.data as Record<string, unknown>).filter(([key, value]) => ['title', 'subtitle', 'text', 'markdown', 'description', 'label', 'body'].includes(key) && typeof value === 'string')))
      const text = fieldsToText(sourceFields)
      if (!text) continue
      records.push({
        entity_type: 'tenant_page',
        entity_id: row.page_id,
        location_id: null,
        page: row.published_path,
        field: block.id,
        label: `${row.title} ${String(block.type ?? 'block')}`,
        position: typeof (block as { position?: unknown }).position === 'number' ? (block as { position: number }).position : blockIndex,
        source_text: text,
        source_fields: sourceFields,
      })
    }
  }

  for (const row of menuRows) {
    const sourceFields = compactFields({ name: row.name, description: row.description })
    const text = fieldsToText(sourceFields)
    if (!text) continue
    records.push({
      entity_type: 'menu',
      entity_id: row.id ?? '',
      location_id: row.location_id ?? null,
      page: null,
      field: 'menu',
      label: `Menu: ${row.name}`,
      source_text: text,
      source_fields: sourceFields,
    })
  }

  for (const row of itemRows) {
    const sourceFields = compactFields({
      section: row.section,
      name: row.name,
      description: row.description,
      allergens: row.allergens,
      ingredients: row.ingredients,
      dietary_notes: row.dietary_notes,
      preparation: row.preparation,
      serving_note: row.serving_note,
    })
    const text = fieldsToText(sourceFields)
    if (!text) continue
    records.push({
      entity_type: 'menu_item',
      entity_id: row.id ?? '',
      location_id: row.location_id ?? null,
      page: null,
      field: 'item',
      label: `Menu item: ${row.name}`,
      source_text: text,
      source_fields: sourceFields,
    })
  }

  for (const row of locationRows) {
    const sourceFields = compactFields({
      title: row.title,
      address: row.address,
      city: row.city,
      description: row.description,
      short_description: row.short_description,
    })
    const text = fieldsToText(sourceFields)
    if (!text) continue
    records.push({
      entity_type: 'business_location',
      entity_id: row.id ?? '',
      location_id: row.id ?? null,
      page: null,
      field: 'location',
      label: `Location: ${row.title}`,
      source_text: text,
      source_fields: sourceFields,
    })
  }

  for (const row of postRows) {
    const sourceFields = compactFields({
      title: row.title,
      body: row.body,
      event_title: row.event_title,
      offer_terms: row.offer_terms,
    })
    const text = fieldsToText(sourceFields)
    if (!text) continue
    records.push({
      entity_type: 'post',
      entity_id: row.id ?? '',
      location_id: row.location_id ?? null,
      page: null,
      field: 'post',
      label: `Post: ${row.title || row.id}`,
      source_text: text,
      source_fields: sourceFields,
    })
  }

  return records.filter(record => record.entity_id)
}

async function ensureTenantPageTranslationFields(
  db: DbClient,
  organizationId: string,
  siteId: string,
  targetLocale: string,
  records: TextRecord[],
) {
  const pageRecords = records.filter(record => record.entity_type === 'tenant_page')
  if (!pageRecords.length) return
  const recordsByPage = new Map<string, TextRecord[]>()
  for (const record of pageRecords) {
    const page = recordsByPage.get(record.entity_id) ?? []
    page.push(record)
    recordsByPage.set(record.entity_id, page)
  }

  await reconcileTenantPageTranslationTopology(db, organizationId, siteId, targetLocale, [...recordsByPage.keys()])

  await Promise.all([...recordsByPage.entries()].map(async ([pageId, page]) => {
    const variant = await queryFirst<{ id: string } | null>(db, `
      SELECT id FROM tenant_page_variants
       WHERE page_id = ? AND organization_id = ? AND site_id = ? AND locale = ?
       LIMIT 1
    `, [pageId, organizationId, siteId, targetLocale])
    if (!variant) return
    const fields = page.map(record => record.field)
    await execute(db, `
      DELETE FROM tenant_page_translation_fields
       WHERE variant_id = ?
         AND field NOT IN (${fields.map(() => '?').join(',')})
    `, [variant.id, ...fields])
  }))

  await executeBatch(db, pageRecords.map(record => ({
      query: `
      INSERT INTO tenant_page_translation_fields
        (id, organization_id, site_id, page_id, variant_id, locale, field, target_block_id, status, created_at, updated_at)
      SELECT ?, ?, ?, ?, v.id, ?, ?,
             CASE WHEN ? IS NULL THEN NULL ELSE (
               SELECT b.id
                 FROM content_documents d
                 JOIN content_blocks b ON b.document_id = d.id
                WHERE d.owner_type = 'tenant_page' AND d.owner_id = v.id
                  AND json_extract(b.data_json, '$.source_block_id') = ?
                LIMIT 1
               ) END,
             'missing', ?, ?
        FROM tenant_page_variants v
       WHERE v.page_id = ? AND v.organization_id = ? AND v.site_id = ? AND v.locale = ?
         AND NOT EXISTS (
           SELECT 1 FROM tenant_page_translation_fields existing
            WHERE existing.variant_id = v.id AND existing.field = ?
         )
    `,
    params: [
      crypto.randomUUID(), organizationId, siteId, record.entity_id, targetLocale, record.field,
      record.position ?? null, record.field,
      new Date().toISOString(), new Date().toISOString(), record.entity_id, organizationId, siteId, targetLocale, record.field,
    ],
  })))
}

export async function buildTranslationInventory(
  db: DbClient,
  organizationId: string,
  siteId: string,
  opts: {
    targetLocale: string
    scope?: TranslationScope
    includePublished?: boolean
  },
): Promise<{ source_locale: string; target_locale: string; scope: TranslationScope; items: TranslationInventoryItem[]; estimate: TranslationEstimate }> {
  const targetLocale = normalizeLocale(opts.targetLocale)
  if (!targetLocale) throw new Error('Invalid target locale.')

  const sourceLocale = await getSourceLocale(db, organizationId, siteId)
  if (targetLocale === sourceLocale) throw new Error('Target locale must be different from the source locale.')

  const scope = opts.scope ?? 'site'
  const records = await getSourceRecords(db, organizationId, siteId)
  await ensureTenantPageTranslationFields(db, organizationId, siteId, targetLocale, records)
  const translationStates = await getTranslationStates(db, organizationId, siteId, targetLocale)
  const items: TranslationInventoryItem[] = []

  for (const record of records) {
    if (!shouldIncludeScope(scope, record.entity_type)) continue
    const sourceText = cleanText(record.source_text)
    if (!sourceText) continue

    const hash = await sourceHash(sourceText)
    const state = translationStates.get(inventoryItemStateKey(record))
    const translationStatus: TranslationInventoryStatus = state?.source_hash && state.source_hash !== hash
      ? 'stale'
      : state?.status ?? 'missing'

    if (!opts.includePublished && translationStatus === 'published') continue

    items.push({
      entity_type: record.entity_type,
      entity_id: record.entity_id,
      location_id: record.location_id ?? null,
      page: record.page ?? null,
      field: record.field,
      label: record.label,
      source_text: sourceText,
      source_fields: record.source_fields ?? { content: sourceText },
      source_hash: hash,
      source_chars: sourceText.length,
      translation_status: translationStatus,
    })
  }

  const estimate = estimateTranslationInventory(sourceLocale, targetLocale, scope, items)
  return { source_locale: sourceLocale, target_locale: targetLocale, scope, items, estimate }
}

export function estimateTranslationInventory(
  sourceLocale: string,
  targetLocale: string,
  scope: TranslationScope,
  items: TranslationInventoryItem[],
): TranslationEstimate {
  const totalChars = items.reduce((sum, item) => sum + item.source_chars, 0)
  const overheadTokens = Math.ceil(items.length * 80)
  const estimatedInputTokens = estimateTokensFromChars(totalChars) + overheadTokens
  const estimatedOutputTokens = Math.ceil(estimateTokensFromChars(totalChars) * 1.25)
  const byEntityType: Record<string, { items: number; chars: number }> = {}

  for (const item of items) {
    const bucket = byEntityType[item.entity_type] ?? { items: 0, chars: 0 }
    bucket.items += 1
    bucket.chars += item.source_chars
    byEntityType[item.entity_type] = bucket
  }

  return {
    source_locale: sourceLocale,
    target_locale: targetLocale,
    scope,
    total_items: items.length,
    total_chars: totalChars,
    estimated_input_tokens: estimatedInputTokens,
    estimated_output_tokens: estimatedOutputTokens,
    estimated_credits: tokensToCredits(estimatedInputTokens, estimatedOutputTokens),
    by_entity_type: byEntityType,
  }
}

export async function createTranslationJob(
  db: DbClient,
  organizationId: string,
  siteId: string,
  userId: string,
  opts: {
    targetLocale: string
    scope?: TranslationScope
    includePublished?: boolean
  },
) {
  const inventory = await buildTranslationInventory(db, organizationId, siteId, opts)
  const jobId = crypto.randomUUID()
  const now = new Date().toISOString()

  await execute(db, `
    INSERT INTO translation_jobs
      (id, organization_id, site_id, source_locale, target_locale, scope, status,
       total_items, total_chars, estimated_input_tokens, estimated_output_tokens, estimated_credits,
       created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    jobId,
    organizationId,
    siteId,
    inventory.source_locale,
    inventory.target_locale,
    inventory.scope,
    inventory.estimate.total_items,
    inventory.estimate.total_chars,
    inventory.estimate.estimated_input_tokens,
    inventory.estimate.estimated_output_tokens,
    inventory.estimate.estimated_credits,
    userId,
    now,
    now,
  ])

  if (inventory.items.length) {
    // executeBatch runs all item inserts as a single atomic D1 batch — a
    // partial failure here must not leave the job with a total_items count
    // that doesn't match the actual number of persisted job items.
    await executeBatch(db, inventory.items.map(item => ({
      query: `
        INSERT INTO translation_job_items
          (id, job_id, organization_id, site_id, target_locale, entity_type, entity_id, location_id, page, field,
           source_hash, source_chars, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)
      `,
      params: [
        crypto.randomUUID(),
        jobId,
        organizationId,
        siteId,
        inventory.target_locale,
        item.entity_type,
        item.entity_id,
        item.location_id,
        item.page,
        item.field,
        item.source_hash,
        item.source_chars,
        now,
        now,
      ],
    })))
  }

  return {
    id: jobId,
    ...inventory.estimate,
    status: 'queued' as const,
  }
}

export async function publishTranslationDrafts(
  db: DbClient,
  organizationId: string,
  siteId: string,
  targetLocale: string,
  scope: TranslationScope = 'site',
  userId?: string,
) {
  const inventory = await buildTranslationInventory(db, organizationId, siteId, {
    targetLocale,
    scope,
    includePublished: true,
  })
  const drafts = inventory.items.filter(item => item.translation_status === 'draft')
  const now = new Date().toISOString()

  let publishedCount = 0
  const tenantPageItemsByPage = new Map<string, TranslationInventoryItem[]>()
  for (const item of inventory.items) {
    if (item.entity_type !== 'tenant_page') continue
    const pageItems = tenantPageItemsByPage.get(item.entity_id) ?? []
    pageItems.push(item)
    tenantPageItemsByPage.set(item.entity_id, pageItems)
  }
  const tenantPageDrafts: TranslationInventoryItem[] = []
  for (const [pageId, pageItems] of tenantPageItemsByPage) {
    if (pageItems.some(item => !['draft', 'published'].includes(item.translation_status))) {
      throw new Error(`Tenant page ${pageId} has untranslated or stale fields; complete and review every block and metadata field before publishing.`)
    }
    tenantPageDrafts.push(...pageItems.filter(item => item.translation_status === 'draft'))
  }

  if (drafts.length) {
    if (tenantPageDrafts.length) {
      const { ensureTenantPageVariant, publishTenantPage } = await import('~/server/utils/tenant-pages')
      const pageIds = [...new Set(tenantPageDrafts.map(item => item.entity_id))]
      for (const pageId of pageIds) {
        const variant = await ensureTenantPageVariant(db, pageId, inventory.target_locale, userId ?? null)
        await publishTenantPage(db, variant.id, {
          userId: userId ?? 'translation-system',
          scope: { siteId, organizationId },
          expectedDocumentUpdatedAt: variant.document.updated_at,
          allowDraftTranslationReview: true,
        })
        await execute(db, `
          UPDATE tenant_page_translation_fields
             SET status = 'published', reviewed_at = ?, reviewed_by = ?, updated_at = ?
           WHERE organization_id = ? AND site_id = ? AND variant_id = ?
        `, [now, userId ?? null, now, organizationId, siteId, variant.id])
      }
    }

    // executeBatch runs all non-page publish updates as a single atomic D1
    // batch. Tenant pages use the revision publisher above so their complete
    // block document and locale variant move together.
    const nonTenantDrafts = drafts.filter(item => item.entity_type !== 'tenant_page')
    const queries: BatchQuery[] = nonTenantDrafts.map((item) => {
      if (item.entity_type === 'menu') {
        return {
          query: `
            UPDATE menu_translations
            SET status = 'published', reviewed_at = ?, updated_at = ?, updated_by = ?
            WHERE organization_id = ? AND site_id = ? AND menu_id = ? AND locale = ?
              AND source_hash = ? AND status = 'draft'
          `,
          params: [now, now, userId ?? null, organizationId, siteId, item.entity_id, inventory.target_locale, item.source_hash],
        }
      }

      if (item.entity_type === 'menu_item') {
        return {
          query: `
            UPDATE menu_item_translations
            SET status = 'published', reviewed_at = ?, updated_at = ?, updated_by = ?
            WHERE organization_id = ? AND site_id = ? AND menu_item_id = ? AND locale = ?
              AND source_hash = ? AND status = 'draft'
          `,
          params: [now, now, userId ?? null, organizationId, siteId, item.entity_id, inventory.target_locale, item.source_hash],
        }
      }

      if (item.entity_type === 'business_location') {
        return {
          query: `
            UPDATE business_location_translations
            SET status = 'published', reviewed_at = ?, updated_at = ?, updated_by = ?
            WHERE organization_id = ? AND site_id = ? AND location_id = ? AND locale = ?
              AND source_hash = ? AND status = 'draft'
          `,
          params: [now, now, userId ?? null, organizationId, siteId, item.entity_id, inventory.target_locale, item.source_hash],
        }
      }

      return {
        query: `
          UPDATE post_translations
          SET status = 'published', reviewed_at = ?, updated_at = ?, updated_by = ?
          WHERE organization_id = ? AND site_id = ? AND post_id = ? AND locale = ?
            AND source_hash = ? AND status = 'draft'
        `,
        params: [now, now, userId ?? null, organizationId, siteId, item.entity_id, inventory.target_locale, item.source_hash],
      }
    })

    if (queries.length) await executeBatch(db, queries)
    const postPublishInventory = await buildTranslationInventory(db, organizationId, siteId, {
      targetLocale: inventory.target_locale,
      scope,
      includePublished: true,
    })
    const publishedKeys = new Set(
      postPublishInventory.items
        .filter(item => item.translation_status === 'published')
        .map(item => `${inventoryItemStateKey(item)}:${item.source_hash}`),
    )
    publishedCount = tenantPageDrafts.length + nonTenantDrafts.filter(item => publishedKeys.has(`${inventoryItemStateKey(item)}:${item.source_hash}`)).length
  }

  return {
    source_locale: inventory.source_locale,
    target_locale: inventory.target_locale,
    scope: inventory.scope,
    published_items: publishedCount,
    skipped_items: inventory.items.length - publishedCount,
  }
}
