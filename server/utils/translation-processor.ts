import { callAiGateway } from '~/server/utils/ai-gateway'
import { chargeCredits, hasCredits } from '~/server/utils/ai-credits'
import { CHOWBOT_MODEL } from '~/server/utils/ai-models'
import { buildTranslationInventory, type TranslationInventoryItem } from '~/server/utils/translation-inventory'
import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'
import { fireSiteEventSafe } from '~/server/utils/site-events'

const TRANSLATION_BATCH_SIZE = 12

interface TranslationJobRow {
  id: string
  organization_id: string
  site_id: string
  source_locale: string
  target_locale: string
  scope: 'site' | 'content' | 'menus' | 'locations' | 'posts'
  status: string
}

interface TranslationJobItemRow {
  id: string
  entity_type: TranslationInventoryItem['entity_type']
  entity_id: string
  field: string
  source_hash: string
}

interface AiTranslatedItem {
  id: string
  fields: Record<string, string>
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return (fenced[1] ?? '').trim()
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    return text.slice(firstBrace, lastBrace + 1)
  }
  return text.trim()
}

function normalizeTranslatedFields(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const fields: Record<string, string> = {}
  for (const [key, fieldValue] of Object.entries(value)) {
    if (typeof fieldValue !== 'string') continue
    const text = fieldValue.trim()
    if (text.length > 0) fields[key] = text
  }
  return fields
}

async function markItem(db: DbClient, id: string, status: 'running' | 'succeeded' | 'failed' | 'skipped', error?: string) {
  await execute(db, `
    UPDATE translation_job_items
    SET status = ?, error = ?, updated_at = ?
    WHERE id = ?
  `, [status, error ?? null, new Date().toISOString(), id])
}

async function upsertSiteContentTranslation(
  db: DbClient,
  job: TranslationJobRow,
  item: TranslationInventoryItem,
  fields: Record<string, string>,
) {
  const content = fields.content ?? null
  const heroTitle = fields.hero_title ?? null
  const heroSubtitle = fields.hero_subtitle ?? null
  const value = content ?? heroTitle ?? null
  const now = new Date().toISOString()
  const id = `translation::${job.organization_id}::${job.site_id}::${item.location_id ?? 'site'}::${job.target_locale}::${item.page ?? 'page'}::${item.field}`

  if (!item.location_id) {
    await execute(db, `
      INSERT INTO site_content_translations
        (id, organization_id, site_id, location_id, locale, page, field, content, hero_title, hero_subtitle, value, type, status, source_hash, translated_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'text', 'draft', ?, ?, ?)
      ON CONFLICT(organization_id, site_id, locale, page, field) WHERE location_id IS NULL DO UPDATE SET
        content = excluded.content,
        hero_title = excluded.hero_title,
        hero_subtitle = excluded.hero_subtitle,
        value = excluded.value,
        status = 'draft',
        source_hash = excluded.source_hash,
        translated_at = excluded.translated_at,
        updated_at = excluded.updated_at
    `, [id, job.organization_id, job.site_id, job.target_locale, item.page, item.field, content, heroTitle, heroSubtitle, value, item.source_hash, now, now])
    return
  }

  await execute(db, `
    INSERT INTO site_content_translations
      (id, organization_id, site_id, location_id, locale, page, field, content, hero_title, hero_subtitle, value, type, status, source_hash, translated_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'text', 'draft', ?, ?, ?)
    ON CONFLICT(organization_id, site_id, location_id, locale, page, field) DO UPDATE SET
      content = excluded.content,
      hero_title = excluded.hero_title,
      hero_subtitle = excluded.hero_subtitle,
      value = excluded.value,
      status = 'draft',
      source_hash = excluded.source_hash,
      translated_at = excluded.translated_at,
      updated_at = excluded.updated_at
  `, [id, job.organization_id, job.site_id, item.location_id, job.target_locale, item.page, item.field, content, heroTitle, heroSubtitle, value, item.source_hash, now, now])
}

async function upsertEntityTranslation(
  db: DbClient,
  job: TranslationJobRow,
  item: TranslationInventoryItem,
  fields: Record<string, string>,
) {
  const now = new Date().toISOString()
  if (item.entity_type === 'site_content') {
    await upsertSiteContentTranslation(db, job, item, fields)
    return
  }

  if (item.entity_type === 'menu') {
    await execute(db, `
      INSERT INTO menu_translations
        (id, organization_id, site_id, menu_id, locale, name, description, status, source_hash, translated_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
      ON CONFLICT(organization_id, site_id, menu_id, locale) DO UPDATE SET
        name = excluded.name, description = excluded.description, status = 'draft',
        source_hash = excluded.source_hash, translated_at = excluded.translated_at, updated_at = excluded.updated_at
    `, [
      `translation::${job.organization_id}::${job.site_id}::menu::${item.entity_id}::${job.target_locale}`,
      job.organization_id, job.site_id, item.entity_id, job.target_locale,
      fields.name ?? null, fields.description ?? null, item.source_hash, now, now,
    ])
    return
  }

  if (item.entity_type === 'menu_item') {
    await execute(db, `
      INSERT INTO menu_item_translations
        (id, organization_id, site_id, menu_item_id, locale, section, name, description, allergens, ingredients, dietary_notes, preparation, serving_note, status, source_hash, translated_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
      ON CONFLICT(organization_id, site_id, menu_item_id, locale) DO UPDATE SET
        section = excluded.section, name = excluded.name, description = excluded.description,
        allergens = excluded.allergens, ingredients = excluded.ingredients, dietary_notes = excluded.dietary_notes,
        preparation = excluded.preparation, serving_note = excluded.serving_note, status = 'draft',
        source_hash = excluded.source_hash, translated_at = excluded.translated_at, updated_at = excluded.updated_at
    `, [
      `translation::${job.organization_id}::${job.site_id}::menu_item::${item.entity_id}::${job.target_locale}`,
      job.organization_id, job.site_id, item.entity_id, job.target_locale,
      fields.section ?? null, fields.name ?? null, fields.description ?? null,
      fields.allergens ?? null, fields.ingredients ?? null, fields.dietary_notes ?? null,
      fields.preparation ?? null, fields.serving_note ?? null, item.source_hash, now, now,
    ])
    return
  }

  if (item.entity_type === 'business_location') {
    await execute(db, `
      INSERT INTO business_location_translations
        (id, organization_id, site_id, location_id, locale, title, address, city, description, short_description, status, source_hash, translated_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
      ON CONFLICT(organization_id, site_id, location_id, locale) DO UPDATE SET
        title = excluded.title, address = excluded.address, city = excluded.city,
        description = excluded.description, short_description = excluded.short_description, status = 'draft',
        source_hash = excluded.source_hash, translated_at = excluded.translated_at, updated_at = excluded.updated_at
    `, [
      `translation::${job.organization_id}::${job.site_id}::location::${item.entity_id}::${job.target_locale}`,
      job.organization_id, job.site_id, item.entity_id, job.target_locale,
      fields.title ?? null, fields.address ?? null, fields.city ?? null,
      fields.description ?? null, fields.short_description ?? null, item.source_hash, now, now,
    ])
    return
  }

  await execute(db, `
    INSERT INTO post_translations
      (id, organization_id, site_id, post_id, locale, title, body, event_title, offer_terms, status, source_hash, translated_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
    ON CONFLICT(organization_id, site_id, post_id, locale) DO UPDATE SET
      title = excluded.title, body = excluded.body, event_title = excluded.event_title,
      offer_terms = excluded.offer_terms, status = 'draft',
      source_hash = excluded.source_hash, translated_at = excluded.translated_at, updated_at = excluded.updated_at
  `, [
    `translation::${job.organization_id}::${job.site_id}::post::${item.entity_id}::${job.target_locale}`,
    job.organization_id, job.site_id, item.entity_id, job.target_locale,
    fields.title ?? null, fields.body ?? null, fields.event_title ?? null,
    fields.offer_terms ?? null, item.source_hash, now, now,
  ])
}

export async function upsertTranslationDraft(
  db: DbClient,
  organizationId: string,
  siteId: string,
  targetLocale: string,
  item: TranslationInventoryItem,
  fields: Record<string, string>,
) {
  await upsertEntityTranslation(db, {
    id: 'manual',
    organization_id: organizationId,
    site_id: siteId,
    source_locale: '',
    target_locale: targetLocale,
    scope: 'site',
    status: 'running',
  }, item, fields)
}

export async function processTranslationJobBatch(
  db: DbClient,
  env: ApiRecord,
  organizationId: string,
  siteId: string,
  jobId: string,
) {
  const job = await queryFirst<TranslationJobRow>(db, `
    SELECT id, organization_id, site_id, source_locale, target_locale, scope, status
    FROM translation_jobs
    WHERE id = ? AND organization_id = ? AND site_id = ?
    LIMIT 1
  `, [jobId, organizationId, siteId])

  if (!job) throw new Error('Translation job not found.')
  if (job.status === 'succeeded' || job.status === 'canceled') return { job_id: jobId, status: job.status, processed: 0 }

  // ai-credits.ts is not yet migrated off raw D1Database; callers here always
  // pass the raw D1 binding today, so this cast is safe at runtime.
  const creditOk = await hasCredits(db as D1Database, organizationId)
  if (!creditOk) throw new Error('No AI credits remaining.')

  const rows = await queryAll<TranslationJobItemRow>(db, `
    SELECT id, entity_type, entity_id, field, source_hash
    FROM translation_job_items
    WHERE job_id = ? AND organization_id = ? AND site_id = ? AND status = 'queued'
    ORDER BY entity_type, page, field
    LIMIT ?
  `, [jobId, organizationId, siteId, TRANSLATION_BATCH_SIZE])

  if (!rows.length) {
    const status = await updateJobProgress(db, jobId)
    return { job_id: jobId, status, processed: 0 }
  }

  await execute(db, `
    UPDATE translation_jobs
    SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ?
    WHERE id = ?
  `, [new Date().toISOString(), new Date().toISOString(), jobId])

  await Promise.all(rows.map(row => markItem(db, row.id, 'running')))

  const inventory = await buildTranslationInventory(db, organizationId, siteId, {
    targetLocale: job.target_locale,
    scope: job.scope,
    includePublished: true,
  })
  const sourceByKey = new Map(inventory.items.map(item => [`${item.entity_type}:${item.entity_id}:${item.field}:${item.source_hash}`, item]))
  const batchItems = rows
    .map(row => ({ row, source: sourceByKey.get(`${row.entity_type}:${row.entity_id}:${row.field}:${row.source_hash}`) }))
    .filter((entry): entry is { row: TranslationJobItemRow; source: TranslationInventoryItem } => Boolean(entry.source))

  const missingRows = rows.filter(row => !sourceByKey.has(`${row.entity_type}:${row.entity_id}:${row.field}:${row.source_hash}`))
  await Promise.all(missingRows.map(row => markItem(db, row.id, 'skipped', 'Source content changed since the job was created.')))

  if (!batchItems.length) {
    const status = await updateJobProgress(db, jobId)
    return { job_id: jobId, status, processed: 0, skipped: missingRows.length }
  }

  const payload = batchItems.map(({ row, source }) => ({
    id: row.id,
    entity_type: source.entity_type,
    label: source.label,
    fields: source.source_fields,
  }))

  const aiResponse = await callAiGateway(env, [
    {
      role: 'user',
      content: JSON.stringify({ source_locale: job.source_locale, target_locale: job.target_locale, items: payload }),
    },
  ], {
    system: [
      'Translate restaurant website content.',
      'Return only JSON shaped as {"items":[{"id":"job item id","fields":{"field":"translated value"}}]}.',
      'Preserve field keys exactly. Translate natural language only. Keep prices, URLs, phone numbers, IDs, and brand names unchanged unless they are normal descriptive words.',
      'For allergens, ingredients, dietary notes, and menu sections, translate the value while preserving comma-separated structure.',
    ].join('\n'),
    maxTokens: 4096,
    metadata: { org_id: organizationId, site_id: siteId, action: 'translation_job' },
  })

  const charge = await chargeCredits(db as D1Database, organizationId, {
    siteId,
    action: 'translation_job',
    model: CHOWBOT_MODEL,
    inputTokens: aiResponse.usage.input_tokens,
    outputTokens: aiResponse.usage.output_tokens,
    cfGatewayLogId: aiResponse.cfLogId,
  })
  await execute(db, `
    UPDATE translation_jobs
    SET actual_input_tokens = actual_input_tokens + ?,
        actual_output_tokens = actual_output_tokens + ?,
        actual_credits = actual_credits + ?,
        updated_at = ?
    WHERE id = ? AND organization_id = ? AND site_id = ?
  `, [
    aiResponse.usage.input_tokens,
    aiResponse.usage.output_tokens,
    charge.creditsCharged,
    new Date().toISOString(),
    jobId,
    organizationId,
    siteId,
  ])

  const rawText = aiResponse.content.find(block => block.type === 'text')?.text ?? ''
  let parsed: { items?: AiTranslatedItem[] }
  try {
    parsed = JSON.parse(extractJson(rawText))
  } catch {
    await Promise.all(batchItems.map(({ row }) => markItem(db, row.id, 'failed', 'AI returned invalid JSON.')))
    await updateJobProgress(db, jobId)
    throw new Error('AI returned invalid translation JSON.')
  }

  const translatedById = new Map((parsed.items ?? []).map(item => [item.id, normalizeTranslatedFields(item.fields)]))
  let processed = 0
  let failed = 0

  for (const { row, source } of batchItems) {
    const fields = translatedById.get(row.id)
    if (!fields || Object.keys(fields).length === 0) {
      failed += 1
      await markItem(db, row.id, 'failed', 'No translated fields returned.')
      continue
    }
    try {
      await upsertEntityTranslation(db, job, source, fields)
      await markItem(db, row.id, 'succeeded')
      processed += 1
    } catch (error) {
      failed += 1
      await markItem(db, row.id, 'failed', error instanceof Error ? error.message : 'Failed to save translation.')
    }
  }

  const status = await updateJobProgress(db, jobId)
  return { job_id: jobId, status, processed, failed, skipped: missingRows.length }
}

export async function processQueuedTranslationJobs(
  db: DbClient,
  env: ApiRecord,
  opts: {
    limit?: number
    batchesPerJob?: number
  } = {},
) {
  const limit = Math.max(1, Math.min(opts.limit ?? 3, 10))
  const batchesPerJob = Math.max(1, Math.min(opts.batchesPerJob ?? 1, 5))
  const jobs = await queryAll<{ id: string; organization_id: string; site_id: string }>(db, `
    SELECT id, organization_id, site_id
    FROM translation_jobs
    WHERE status IN ('queued', 'running')
    ORDER BY created_at ASC
    LIMIT ?
  `, [limit])

  const results: Array<{ job_id: string; status: string; processed: number; failed?: number; skipped?: number; error?: string }> = []
  for (const job of jobs) {
    for (let index = 0; index < batchesPerJob; index += 1) {
      try {
        const result = await processTranslationJobBatch(db, env, job.organization_id, job.site_id, job.id)
        results.push(result)
        if (result.status !== 'queued' && result.status !== 'running') break
        if (result.processed === 0 && !result.skipped) break
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to process translation job.'
        await execute(db, `
          UPDATE translation_jobs
          SET status = 'failed', error = ?, finished_at = ?, updated_at = ?
          WHERE id = ? AND organization_id = ? AND site_id = ?
        `, [message, new Date().toISOString(), new Date().toISOString(), job.id, job.organization_id, job.site_id])
        results.push({ job_id: job.id, status: 'failed', processed: 0, error: message })
        break
      }
    }
  }

  return { processed_jobs: results.length, results }
}

async function updateJobProgress(db: DbClient, jobId: string) {
  const counts = await queryFirst<{ processed_items: number | null; failed_items: number | null; remaining_items: number | null }>(db, `
    SELECT
      SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS processed_items,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_items,
      SUM(CASE WHEN status = 'queued' OR status = 'running' THEN 1 ELSE 0 END) AS remaining_items
    FROM translation_job_items
    WHERE job_id = ?
  `, [jobId])

  const processed = counts?.processed_items ?? 0
  const failed = counts?.failed_items ?? 0
  const remaining = counts?.remaining_items ?? 0
  const status = remaining === 0 ? (failed > 0 ? 'failed' : 'succeeded') : 'running'
  const now = new Date().toISOString()

  const previousJob = await queryFirst<{ status: string | null }>(
    db,
    `SELECT status FROM translation_jobs WHERE id = ? LIMIT 1`,
    [jobId],
  )

  const updateResult = await execute(db, `
    UPDATE translation_jobs
    SET processed_items = ?, failed_items = ?, status = ?, finished_at = CASE WHEN ? = 0 THEN ? ELSE finished_at END, updated_at = ?
    WHERE id = ?
  `, [processed, failed, status, remaining, now, now, jobId])

  if (status === 'succeeded' && previousJob?.status !== 'succeeded' && updateResult?.meta?.changes > 0) {
    const job = await queryFirst<{ organization_id: string; site_id: string; target_locale: string; scope: string }>(
      db,
      `SELECT organization_id, site_id, target_locale, scope FROM translation_jobs WHERE id = ? LIMIT 1`,
      [jobId],
    )
    if (job) {
      await fireSiteEventSafe({
        db,
        organizationId: job.organization_id,
        siteId: job.site_id,
        eventType: 'translation.job_completed',
        entityType: 'translation_job',
        entityId: jobId,
        metadata: {
          target_locale: job.target_locale,
          scope: job.scope,
          processed_items: processed,
        },
      })
    }
  }

  return status
}
