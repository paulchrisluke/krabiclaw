import { tokensToCredits } from '~/server/utils/ai-credits'
import { getSourceLocale } from '~/server/utils/site-locales'
import { normalizeLocale } from '~/server/utils/site-i18n'
import { execute, executeBatch, queryAll, type BatchQuery, type DbClient } from '~/server/db'

export type TranslationEntityType = 'site_content' | 'menu' | 'menu_item' | 'business_location' | 'post'
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
  source_text?: string | null
  source_fields?: Record<string, string>
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
  if (scope === 'content') return entityType === 'site_content'
  if (scope === 'menus') return entityType === 'menu' || entityType === 'menu_item'
  if (scope === 'locations') return entityType === 'business_location'
  if (scope === 'posts') return entityType === 'post'
  return false
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
      SELECT 'site_content' AS entity_type, COALESCE(location_id, 'site') || ':' || page AS entity_id,
             field, source_hash, status
      FROM site_content_translations
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

  return new Map(rows.map(row => [`${row.entity_type}:${row.entity_id}:${row.field}`, row]))
}

async function getSourceRecords(
  db: DbClient,
  organizationId: string,
  siteId: string,
): Promise<TextRecord[]> {
  const [contentRows, menuRows, itemRows, locationRows, postRows] = await Promise.all([
    queryAll<Record<string, string | null>>(db, `
      SELECT id, location_id, page, field, content, value, hero_title, hero_subtitle, type
      FROM site_content
      WHERE organization_id = ? AND site_id = ?
      ORDER BY page, field
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

  for (const row of contentRows) {
    if (row.field === 'hero') {
      const sourceFields = compactFields({ hero_title: row.hero_title, hero_subtitle: row.hero_subtitle })
      const heroText = fieldsToText(sourceFields)
      if (heroText) {
        records.push({
          entity_type: 'site_content',
          entity_id: `${row.location_id ?? 'site'}:${row.page}`,
          location_id: row.location_id ?? null,
          page: row.page,
          field: 'hero',
          label: `${row.page} hero`,
          source_text: heroText,
          source_fields: sourceFields,
        })
      }
      continue
    }

    const text = cleanText(row.content) || cleanText(row.value)
    if (!text) continue
    if (row.type === 'media' || row.type === 'image') continue
    records.push({
      entity_type: 'site_content',
      entity_id: `${row.location_id ?? 'site'}:${row.page}`,
      location_id: row.location_id ?? null,
      page: row.page,
      field: row.field ?? 'content',
      label: `${row.page} ${row.field}`,
      source_text: text,
      source_fields: { content: text },
    })
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
  const translationStates = await getTranslationStates(db, organizationId, siteId, targetLocale)
  const records = await getSourceRecords(db, organizationId, siteId)
  const items: TranslationInventoryItem[] = []

  for (const record of records) {
    if (!shouldIncludeScope(scope, record.entity_type)) continue
    const sourceText = cleanText(record.source_text)
    if (!sourceText) continue

    const hash = await sourceHash(sourceText)
    const state = translationStates.get(`${record.entity_type}:${record.entity_id}:${record.field}`)
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
  if (drafts.length) {
    // executeBatch runs all per-item publish updates as a single atomic D1
    // batch — a partial failure here must not leave some drafts published
    // and others still pending for the same publish action.
    const queries: BatchQuery[] = drafts.map((item) => {
      if (item.entity_type === 'site_content') {
        if (!item.location_id) {
          return {
            query: `
              UPDATE site_content_translations
              SET status = 'published', reviewed_at = ?, updated_at = ?, updated_by = ?
              WHERE organization_id = ? AND site_id = ? AND locale = ? AND page = ? AND field = ?
                AND location_id IS NULL AND source_hash = ? AND status = 'draft'
            `,
            params: [now, now, userId ?? null, organizationId, siteId, inventory.target_locale, item.page, item.field, item.source_hash],
          }
        }

        return {
          query: `
            UPDATE site_content_translations
            SET status = 'published', reviewed_at = ?, updated_at = ?, updated_by = ?
            WHERE organization_id = ? AND site_id = ? AND location_id = ? AND locale = ? AND page = ? AND field = ?
              AND source_hash = ? AND status = 'draft'
          `,
          params: [now, now, userId ?? null, organizationId, siteId, item.location_id, inventory.target_locale, item.page, item.field, item.source_hash],
        }
      }

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

    const batchResults = await executeBatch(db, queries)
    publishedCount = (batchResults || []).reduce((sum, res) => sum + (res.meta?.changes ?? 0), 0)
  }

  return {
    source_locale: inventory.source_locale,
    target_locale: inventory.target_locale,
    scope: inventory.scope,
    published_items: publishedCount,
    skipped_items: inventory.items.length - publishedCount,
  }
}
