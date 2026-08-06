import { buildTranslationInventory, type TranslationEntityType, type TranslationInventoryStatus, type TranslationScope } from '~/server/utils/translation-inventory'
import { upsertTranslationDraft } from '~/server/utils/translation-processor'
import { queryAll, type DbClient } from '~/server/db'

export interface TranslationReviewItem {
  entity_type: TranslationEntityType
  entity_id: string
  location_id: string | null
  page: string | null
  field: string
  label: string
  status: TranslationInventoryStatus
  source_hash: string
  source_fields: Record<string, string>
  translated_fields: Record<string, string>
}

function cleanFields(fields: Record<string, unknown>): Record<string, string> {
  const cleaned: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== 'string') continue
    const text = value.trim()
    if (text) cleaned[key] = text
  }
  return cleaned
}

function stateKey(entityType: TranslationEntityType, entityId: string, field: string) {
  return `${entityType}:${entityId}:${field}`
}

async function getTranslatedFields(
  db: DbClient,
  organizationId: string,
  siteId: string,
  locale: string,
): Promise<Map<string, Record<string, string>>> {
  const [pageRows, pageMetadataRows, menuRows, itemRows, locationRows, postRows] = await Promise.all([
    queryAll<{ entity_id: string; field: string; data_json: string | null }>(db, `
      SELECT v.page_id AS entity_id, COALESCE(tf.field, b.id) AS field, b.data_json
      FROM tenant_page_variants v
      JOIN content_documents d ON d.owner_type = 'tenant_page' AND d.owner_id = v.id
      JOIN content_revisions r ON r.id = COALESCE(d.draft_revision_id, d.published_revision_id)
      JOIN content_blocks b ON b.document_id = r.document_id
      LEFT JOIN tenant_page_translation_fields tf ON tf.variant_id = v.id AND tf.target_block_id = b.id
      WHERE v.organization_id = ? AND v.site_id = ? AND v.locale = ?
      ORDER BY b.position
    `, [organizationId, siteId, locale]),
    queryAll<{ entity_id: string; snapshot_json: string }>(db, `
      SELECT v.page_id AS entity_id, r.snapshot_json
      FROM tenant_page_variants v
      JOIN content_documents d ON d.owner_type = 'tenant_page' AND d.owner_id = v.id
      JOIN content_revisions r ON r.id = COALESCE(d.draft_revision_id, d.published_revision_id)
      WHERE v.organization_id = ? AND v.site_id = ? AND v.locale = ?
    `, [organizationId, siteId, locale]),
    queryAll<Record<string, string | null>>(db, `
      SELECT menu_id AS entity_id, name, description
      FROM menu_translations
      WHERE organization_id = ? AND site_id = ? AND locale = ?
    `, [organizationId, siteId, locale]),
    queryAll<Record<string, string | null>>(db, `
      SELECT menu_item_id AS entity_id, section, name, description, allergens, ingredients, dietary_notes, preparation, serving_note
      FROM menu_item_translations
      WHERE organization_id = ? AND site_id = ? AND locale = ?
    `, [organizationId, siteId, locale]),
    queryAll<Record<string, string | null>>(db, `
      SELECT location_id AS entity_id, title, address, city, description, short_description
      FROM business_location_translations
      WHERE organization_id = ? AND site_id = ? AND locale = ?
    `, [organizationId, siteId, locale]),
    queryAll<Record<string, string | null>>(db, `
      SELECT post_id AS entity_id, title, body, event_title, offer_terms
      FROM post_translations
      WHERE organization_id = ? AND site_id = ? AND locale = ?
    `, [organizationId, siteId, locale]),
  ])

  const rows = new Map<string, Record<string, string>>()

  for (const row of pageRows) {
    let data: unknown
    try { data = row.data_json ? JSON.parse(row.data_json) : {} } catch { throw new Error(`Translated tenant page block ${row.field} is malformed.`) }
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue
    const fields = cleanFields(Object.fromEntries(
      Object.entries(data as Record<string, unknown>)
        .filter(([key, value]) => ['title', 'subtitle', 'text', 'markdown', 'description', 'label', 'body'].includes(key) && typeof value === 'string'),
    ))
    if (Object.keys(fields).length) rows.set(stateKey('tenant_page', row.entity_id || '', row.field), fields)
  }

  for (const row of pageMetadataRows) {
    let snapshot: unknown
    try { snapshot = JSON.parse(row.snapshot_json) } catch { throw new Error(`Translated tenant page ${row.entity_id} metadata is malformed.`) }
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) continue
    const metadata = (snapshot as { metadata?: unknown }).metadata
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) continue
    for (const field of ['title', 'summary', 'seoTitle', 'seoDescription', 'canonicalUrl']) {
      const value = (metadata as Record<string, unknown>)[field]
      if (typeof value === 'string' && value.trim()) rows.set(stateKey('tenant_page', row.entity_id, `metadata.${field}`), { content: value })
    }
  }

  for (const row of menuRows) {
    rows.set(stateKey('menu', row.entity_id || '', 'menu'), cleanFields({ name: row.name, description: row.description }))
  }

  for (const row of itemRows) {
    rows.set(stateKey('menu_item', row.entity_id || '', 'item'), cleanFields({
      section: row.section,
      name: row.name,
      description: row.description,
      allergens: row.allergens,
      ingredients: row.ingredients,
      dietary_notes: row.dietary_notes,
      preparation: row.preparation,
      serving_note: row.serving_note,
    }))
  }

  for (const row of locationRows) {
    rows.set(stateKey('business_location', row.entity_id || '', 'location'), cleanFields({
      title: row.title,
      address: row.address,
      city: row.city,
      description: row.description,
      short_description: row.short_description,
    }))
  }

  for (const row of postRows) {
    rows.set(stateKey('post', row.entity_id || '', 'post'), cleanFields({
      title: row.title,
      body: row.body,
      event_title: row.event_title,
      offer_terms: row.offer_terms,
    }))
  }

  return rows
}

export async function listTranslationReviewItems(
  db: DbClient,
  organizationId: string,
  siteId: string,
  opts: {
    targetLocale: string
    scope?: TranslationScope
    status?: TranslationInventoryStatus | 'all'
  },
) {
  const inventory = await buildTranslationInventory(db, organizationId, siteId, {
    targetLocale: opts.targetLocale,
    scope: opts.scope ?? 'site',
    includePublished: true,
  })
  const translatedFields = await getTranslatedFields(db, organizationId, siteId, inventory.target_locale)

  const items = inventory.items
    .filter(item => !opts.status || opts.status === 'all' || item.translation_status === opts.status)
    .map(item => ({
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      location_id: item.location_id,
      page: item.page,
      field: item.field,
      label: item.label,
      status: item.translation_status,
      source_hash: item.source_hash,
      source_fields: item.source_fields,
      translated_fields: translatedFields.get(stateKey(item.entity_type, item.entity_id, item.field)) ?? {},
    }))

  return {
    source_locale: inventory.source_locale,
    target_locale: inventory.target_locale,
    scope: inventory.scope,
    estimate: inventory.estimate,
    items,
  }
}

export async function saveTranslationReviewItem(
  db: DbClient,
  organizationId: string,
  siteId: string,
  opts: {
    targetLocale: string
    scope?: TranslationScope
    entityType: TranslationEntityType
    entityId: string
    field: string
    fields: Record<string, unknown>
  },
) {
  const inventory = await buildTranslationInventory(db, organizationId, siteId, {
    targetLocale: opts.targetLocale,
    scope: opts.scope ?? 'site',
    includePublished: true,
  })
  const item = inventory.items.find(candidate =>
    candidate.entity_type === opts.entityType
    && candidate.entity_id === opts.entityId
    && candidate.field === opts.field
  )
  if (!item) throw new Error('Translation source item not found.')

  const allowedKeys = new Set(Object.keys(item.source_fields))
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(cleanFields(opts.fields))) {
    if (allowedKeys.has(key)) fields[key] = value
  }
  if (!Object.keys(fields).length) throw new Error('At least one translated field is required.')

  await upsertTranslationDraft(db, organizationId, siteId, inventory.target_locale, item, fields)

  return {
    target_locale: inventory.target_locale,
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    field: item.field,
    status: 'draft' as const,
    translated_fields: fields,
  }
}
