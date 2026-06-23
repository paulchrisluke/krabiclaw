import { execute, queryAll, queryFirst, type DbClient } from '~/server/db'

export interface SiteContent {
  id: string
  organization_id: string
  site_id: string
  location_id?: string
  page: string
  field: string
  value?: string
  type: string
  source: string
  content?: string
  hero_title?: string | null
  hero_subtitle?: string | null
  hero_image_asset_id?: string | null
  hero_video_asset_id?: string | null
  /** Resolved public URL of hero_image_asset_id — injected by getPageContent JOINs */
  hero_public_url?: string | null
  hero_kind?: string | null
  /** Resolved public URL of hero_video_asset_id — injected by getPageContent JOINs */
  hero_video_public_url?: string | null
  hero_video_kind?: string | null
  thumbnail_url?: string | null
  /** Component identifier for dynamic rendering */
  component?: string | null
  updated_at: string
}

interface SiteContentTranslationRow {
  field: string
  content: string | null
  value: string | null
  type: string | null
  hero_title: string | null
  hero_subtitle: string | null
  component: string | null
  updated_at: string
}

// Site Content
export const getSiteContent = async (db: DbClient, organizationId: string, siteId: string, locationId?: string): Promise<SiteContent[]> => {
  let query = `
    SELECT id, organization_id, site_id, location_id, page, field, value, type, source, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id, component, updated_at
     FROM site_content
     WHERE organization_id = ? AND site_id = ?
  `
  const params = [organizationId, siteId]

  if (locationId) {
    query += ` AND location_id = ?`
    params.push(locationId)
  } else {
    query += ` AND location_id IS NULL`
  }

  query += ` ORDER BY page, field`

  const results = await queryAll<SiteContent>(db, query, params)
  return results ?? []
}

export const getPageContent = async (db: DbClient, organizationId: string, siteId: string, page: string, locationId?: string): Promise<SiteContent[]> => {
  let query = `
    SELECT sc.id, sc.organization_id, sc.site_id, sc.location_id, sc.page, sc.field,
           sc.value, sc.type, sc.source, sc.content, sc.hero_title, sc.hero_subtitle,
           sc.hero_image_asset_id, sc.hero_video_asset_id, sc.component, sc.updated_at,
           img.public_url AS hero_public_url, img.kind AS hero_kind,
           vid.public_url AS hero_video_public_url, vid.kind AS hero_video_kind,
           vid.thumbnail_url
    FROM site_content sc
    LEFT JOIN media_assets img ON sc.hero_image_asset_id = img.id AND img.status = 'active'
    LEFT JOIN media_assets vid ON sc.hero_video_asset_id = vid.id AND vid.status = 'active'
    WHERE sc.organization_id = ? AND sc.site_id = ? AND sc.page = ?
  `
  const params = [organizationId, siteId, page]

  if (locationId) {
    query += ` AND sc.location_id = ?`
    params.push(locationId)
  } else {
    query += ` AND sc.location_id IS NULL`
  }

  query += ` ORDER BY sc.field`

  const results = await queryAll<SiteContent>(db, query, params)
  return results ?? []
}

async function resolveMediaFieldUrls(
  db: DbClient,
  siteId: string,
  rows: SiteContent[],
): Promise<SiteContent[]> {
  const isMediaAssetId = (value: string | null): value is string => {
    return typeof value === 'string' && value.length > 0 && !/^https?:\/\//i.test(value)
  }

  const mediaAssetIds = Array.from(
    new Set(
      rows
        .filter((row) => row.type === 'media')
        .map((row) => row.content ?? row.value ?? null)
        .filter(isMediaAssetId),
    ),
  )

  if (!mediaAssetIds.length) return rows

  const placeholders = mediaAssetIds.map(() => '?').join(', ')
  const results = await queryAll<{ id: string; public_url: string | null }>(
    db,
    `SELECT id, public_url
       FROM media_assets
       WHERE site_id = ?
         AND status = 'active'
         AND id IN (${placeholders})`,
    [siteId, ...mediaAssetIds],
  )

  const publicUrlByAssetId = new Map<string, string | null>(
    (results ?? []).map((asset) => [asset.id, asset.public_url]),
  )

  return rows.map((row) => {
    if (row.type !== 'media') return row

    const assetId = row.content ?? row.value ?? null
    if (!assetId || /^https?:\/\//i.test(assetId)) return row

    const publicUrl = publicUrlByAssetId.get(assetId) ?? null
    const fallbackValue = row.value && /^https?:\/\//i.test(row.value) ? row.value : undefined
    return {
      ...row,
      content: publicUrl ?? undefined,
      value: publicUrl ?? fallbackValue,
    }
  })
}

export const getPublishedPageContentForLocale = async (
  db: DbClient,
  organizationId: string,
  siteId: string,
  page: string,
  opts: {
    locale?: string
    sourceLocale?: string
    fallbackEnabled?: boolean
    locationId?: string
  } = {},
): Promise<SiteContent[]> => {
  const sourceContent = await getPageContent(db, organizationId, siteId, page, opts.locationId)
  if (!opts.locale || opts.locale === opts.sourceLocale) {
    return await resolveMediaFieldUrls(db, siteId, sourceContent)
  }

  let query = `
    SELECT field, content, value, type, hero_title, hero_subtitle, component, updated_at
    FROM site_content_translations
    WHERE organization_id = ? AND site_id = ? AND page = ? AND locale = ? AND status = 'published'
  `
  const params = [organizationId, siteId, page, opts.locale]

  if (opts.locationId) {
    query += ` AND location_id = ?`
    params.push(opts.locationId)
  } else {
    query += ` AND location_id IS NULL`
  }

  const results = await queryAll<SiteContentTranslationRow>(db, query, params)
  const translations = results ?? []
  if (!translations.length) {
    const baseRows = opts.fallbackEnabled === false ? [] : sourceContent
    return await resolveMediaFieldUrls(db, siteId, baseRows)
  }

  const sourceByField = new Map(sourceContent.map(row => [row.field, row]))
  const translatedFields = new Set<string>()

  for (const translation of translations) {
    const base = sourceByField.get(translation.field)
    const translated: SiteContent = {
      ...(base ?? {
        id: `translation::${organizationId}::${siteId}::${opts.locationId ?? 'site'}::${opts.locale}::${page}::${translation.field}`,
        organization_id: organizationId,
        site_id: siteId,
        location_id: opts.locationId,
        page,
        field: translation.field,
        source: 'manual',
        hero_image_asset_id: undefined,
        hero_video_asset_id: undefined,
      }),
      field: translation.field,
      value: translation.value ?? translation.content ?? base?.value,
      content: translation.content ?? translation.value ?? base?.content,
      type: translation.type ?? base?.type ?? 'text',
      hero_title: translation.hero_title ?? base?.hero_title,
      hero_subtitle: translation.hero_subtitle ?? base?.hero_subtitle,
      updated_at: translation.updated_at,
    }
    sourceByField.set(translation.field, translated)
    translatedFields.add(translation.field)
  }

  if (opts.fallbackEnabled === false) {
    return await resolveMediaFieldUrls(
      db,
      siteId,
      Array.from(translatedFields)
      .map(field => sourceByField.get(field))
      .filter((row): row is SiteContent => Boolean(row))
      .sort((a, b) => a.field.localeCompare(b.field)),
    )
  }

  return await resolveMediaFieldUrls(
    db,
    siteId,
    Array.from(sourceByField.values()).sort((a, b) => a.field.localeCompare(b.field)),
  )
}

export const getSiteContentField = async (db: DbClient, organizationId: string, siteId: string, locationId: string | null, page: string, field: string): Promise<SiteContent | null> => {
  let query = `
    SELECT id, organization_id, site_id, location_id, page, field, value, type, source, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id, component, updated_at
     FROM site_content
     WHERE organization_id = ? AND site_id = ? AND page = ? AND field = ?
  `
  const params = [organizationId, siteId, page, field]

  if (locationId) {
    query += ` AND location_id = ?`
    params.push(locationId)
  } else {
    query += ` AND location_id IS NULL`
  }

  const result = await queryFirst<SiteContent>(db, query, params)
  return result ?? null
}

export const deleteSiteContentField = async (
  db: DbClient,
  organizationId: string,
  siteId: string,
  page: string,
  field: string,
  locationId?: string,
) => {
  let query = `DELETE FROM site_content WHERE organization_id = ? AND site_id = ? AND page = ? AND field = ?`
  const params: Array<string> = [organizationId, siteId, page, field]

  if (locationId) {
    query += ` AND location_id = ?`
    params.push(locationId)
  } else {
    query += ` AND location_id IS NULL`
  }

  await execute(db, query, params)
}

export const upsertSiteContent = async (db: DbClient, content: Omit<SiteContent, 'updated_at'>) => {
  const hasHeroTitle = content.hero_title !== undefined
  const hasHeroSubtitle = content.hero_subtitle !== undefined
  const hasHeroImageAssetId = content.hero_image_asset_id !== undefined
  const hasHeroVideoAssetId = content.hero_video_asset_id !== undefined
  const values = [
    content.id || crypto.randomUUID(),
    content.organization_id,
    content.site_id,
    content.location_id || null,
    content.page,
    content.field,
    content.value || null,
    content.type || 'text',
    content.source || 'manual',
    content.content || null,
    content.hero_title ?? null,
    content.hero_subtitle ?? null,
    content.hero_image_asset_id ?? null,
    content.hero_video_asset_id ?? null,
    content.component || null,
  ]
  const flags = [hasHeroTitle ? 1 : 0, hasHeroSubtitle ? 1 : 0, hasHeroImageAssetId ? 1 : 0, hasHeroVideoAssetId ? 1 : 0]

  if (!content.location_id) {
    await execute(
      db,
      `
      INSERT INTO site_content (id, organization_id, site_id, location_id, page, field, value, type, source, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id, component)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, site_id, page, field) WHERE location_id IS NULL DO UPDATE SET
        content = excluded.content,
        hero_title = CASE WHEN ? THEN excluded.hero_title ELSE site_content.hero_title END,
        hero_subtitle = CASE WHEN ? THEN excluded.hero_subtitle ELSE site_content.hero_subtitle END,
        hero_image_asset_id = CASE WHEN ? THEN excluded.hero_image_asset_id ELSE site_content.hero_image_asset_id END,
        hero_video_asset_id = CASE WHEN ? THEN excluded.hero_video_asset_id ELSE site_content.hero_video_asset_id END,
        value = excluded.value,
        type = excluded.type,
        source = excluded.source,
        component = excluded.component,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `,
      [...values, ...flags],
    )
    return
  }

  await execute(
    db,
    `
    INSERT INTO site_content (id, organization_id, site_id, location_id, page, field, value, type, source, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id, component)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, site_id, location_id, page, field) DO UPDATE SET
      content = excluded.content,
      hero_title = CASE WHEN ? THEN excluded.hero_title ELSE site_content.hero_title END,
      hero_subtitle = CASE WHEN ? THEN excluded.hero_subtitle ELSE site_content.hero_subtitle END,
      hero_image_asset_id = CASE WHEN ? THEN excluded.hero_image_asset_id ELSE site_content.hero_image_asset_id END,
      hero_video_asset_id = CASE WHEN ? THEN excluded.hero_video_asset_id ELSE site_content.hero_video_asset_id END,
      value = excluded.value,
      type = excluded.type,
      source = excluded.source,
      component = excluded.component,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `,
    [...values, ...flags],
  )
}
