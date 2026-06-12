import type { D1Database } from '@cloudflare/workers-types'

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
  hero_title?: string
  hero_subtitle?: string
  hero_image_asset_id?: string
  hero_video_asset_id?: string
  /** Resolved public URL of hero_image_asset_id — injected by getPageContent/getDraftContent JOINs */
  hero_public_url?: string | null
  hero_kind?: string | null
  /** Resolved public URL of hero_video_asset_id — injected by getPageContent/getDraftContent JOINs */
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
export const getSiteContent = async (db: D1Database, organizationId: string, siteId: string, locationId?: string): Promise<SiteContent[]> => {
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
  
  const { results } = await db.prepare(query).bind(...params).all<SiteContent>()
  return results ?? []
}

export const getPageContent = async (db: D1Database, organizationId: string, siteId: string, page: string, locationId?: string): Promise<SiteContent[]> => {
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

  const { results } = await db.prepare(query).bind(...params).all<SiteContent>()
  return results ?? []
}

export const getPublishedPageContentForLocale = async (
  db: D1Database,
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
  if (!opts.locale || opts.locale === opts.sourceLocale) return sourceContent

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

  const { results } = await db.prepare(query).bind(...params).all<SiteContentTranslationRow>()
  const translations = results ?? []
  if (!translations.length) return opts.fallbackEnabled === false ? [] : sourceContent

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
    return Array.from(translatedFields)
      .map(field => sourceByField.get(field))
      .filter((row): row is SiteContent => Boolean(row))
      .sort((a, b) => a.field.localeCompare(b.field))
  }

  return Array.from(sourceByField.values()).sort((a, b) => a.field.localeCompare(b.field))
}

export const getSiteContentField = async (db: D1Database, organizationId: string, siteId: string, locationId: string | null, page: string, field: string): Promise<SiteContent | null> => {
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
  
  const result = await db.prepare(query).bind(...params).first<SiteContent>()
  return result ?? null
}

export const deleteSiteContentField = async (
  db: D1Database,
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

  await db.prepare(query).bind(...params).run()
}

export const deleteDraftContentField = async (
  db: D1Database,
  organizationId: string,
  siteId: string,
  page: string,
  field: string,
  locationId?: string,
) => {
  let query = `DELETE FROM site_content_drafts WHERE organization_id = ? AND site_id = ? AND page = ? AND field = ?`
  const params: Array<string> = [organizationId, siteId, page, field]

  if (locationId) {
    query += ` AND location_id = ?`
    params.push(locationId)
  } else {
    query += ` AND location_id IS NULL`
  }

  await db.prepare(query).bind(...params).run()
}

export const deleteSiteAndDraftContentField = async (
  db: D1Database,
  organizationId: string,
  siteId: string,
  page: string,
  field: string,
  locationId?: string,
) => {
  const params: Array<string> = [organizationId, siteId, page, field]
  const locationClause = locationId ? 'AND location_id = ?' : 'AND location_id IS NULL'
  if (locationId) params.push(locationId)

  await db.batch([
    db.prepare(`DELETE FROM site_content WHERE organization_id = ? AND site_id = ? AND page = ? AND field = ? ${locationClause}`).bind(...params),
    db.prepare(`DELETE FROM site_content_drafts WHERE organization_id = ? AND site_id = ? AND page = ? AND field = ? ${locationClause}`).bind(...params),
  ])
}


// Draft Management
export const getDraftContent = async (db: D1Database, organizationId: string, siteId: string, page: string, locationId?: string): Promise<SiteContent[]> => {
  let query = `
    SELECT sc.id, sc.organization_id, sc.site_id, sc.location_id, sc.page, sc.field,
           sc.value, sc.type, sc.source, sc.content, sc.hero_title, sc.hero_subtitle,
           sc.hero_image_asset_id, sc.hero_video_asset_id, sc.component, sc.updated_at,
           img.public_url AS hero_public_url, img.kind AS hero_kind,
           vid.public_url AS hero_video_public_url, vid.kind AS hero_video_kind,
           vid.thumbnail_url
    FROM site_content_drafts sc
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
  
  query += ` ORDER BY field`
  
  const { results } = await db.prepare(query).bind(...params).all<SiteContent>()
  return results ?? []
}

export const buildUpsertDraftStmt = (db: D1Database, content: Omit<SiteContent, 'updated_at'>) => {
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
    content.hero_title || null,
    content.hero_subtitle || null,
    content.hero_image_asset_id || null,
    content.hero_video_asset_id || null,
    content.component || null,
  ]

  if (!content.location_id) {
    return db.prepare(`
      INSERT INTO site_content_drafts (id, organization_id, site_id, location_id, page, field, value, type, source, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id, component)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, site_id, page, field) WHERE location_id IS NULL DO UPDATE SET
        value = excluded.value,
        type = excluded.type,
        source = excluded.source,
        content = excluded.content,
        hero_title = excluded.hero_title,
        hero_subtitle = excluded.hero_subtitle,
        hero_image_asset_id = excluded.hero_image_asset_id,
        hero_video_asset_id = excluded.hero_video_asset_id,
        component = excluded.component,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).bind(...values)
  }

  return db.prepare(`
    INSERT INTO site_content_drafts (id, organization_id, site_id, location_id, page, field, value, type, source, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id, component)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, site_id, location_id, page, field) DO UPDATE SET
      value = excluded.value,
      type = excluded.type,
      source = excluded.source,
      content = excluded.content,
      hero_title = excluded.hero_title,
      hero_subtitle = excluded.hero_subtitle,
      hero_image_asset_id = excluded.hero_image_asset_id,
      hero_video_asset_id = excluded.hero_video_asset_id,
      component = excluded.component,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(...values)
}

export const upsertDraftContent = async (db: D1Database, content: Omit<SiteContent, 'updated_at'>) => {
  await buildUpsertDraftStmt(db, content).run()
}

export const buildUpsertSiteStmt = (db: D1Database, content: Omit<SiteContent, 'updated_at'>) => {
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
    content.hero_title || null,
    content.hero_subtitle || null,
    content.hero_image_asset_id || null,
    content.hero_video_asset_id || null,
    content.component || null,
  ]

  if (!content.location_id) {
    return db.prepare(`
      INSERT INTO site_content (id, organization_id, site_id, location_id, page, field, value, type, source, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id, component)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, site_id, page, field) WHERE location_id IS NULL DO UPDATE SET
        content = excluded.content,
        hero_title = excluded.hero_title,
        hero_subtitle = excluded.hero_subtitle,
        hero_image_asset_id = excluded.hero_image_asset_id,
        hero_video_asset_id = excluded.hero_video_asset_id,
        value = excluded.value,
        type = excluded.type,
        source = excluded.source,
        component = excluded.component,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).bind(...values)
  }

  return db.prepare(`
    INSERT INTO site_content (id, organization_id, site_id, location_id, page, field, value, type, source, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id, component)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, site_id, location_id, page, field) DO UPDATE SET
      content = excluded.content,
      hero_title = excluded.hero_title,
      hero_subtitle = excluded.hero_subtitle,
      hero_image_asset_id = excluded.hero_image_asset_id,
      hero_video_asset_id = excluded.hero_video_asset_id,
      value = excluded.value,
      type = excluded.type,
      source = excluded.source,
      component = excluded.component,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(...values)
}

export const upsertSiteContent = async (db: D1Database, content: Omit<SiteContent, 'updated_at'>) => {
  await buildUpsertSiteStmt(db, content).run()
}

export const publishDrafts = async (db: D1Database, organizationId: string, siteId: string, page: string, locationId?: string) => {
  console.log(`[content-management.ts] publishDrafts called for org: ${organizationId}, site: ${siteId}, page: ${page}, location: ${locationId}`)
  const drafts = await getDraftContent(db, organizationId, siteId, page, locationId)
  if (drafts.length === 0) {
    console.log(`[content-management.ts] No drafts found for page: ${page}, aborting.`)
    return
  }
  
  const stmts = []

  for (const draft of drafts) {
    let existingQuery = `
      SELECT id
      FROM site_content
      WHERE organization_id = ? AND site_id = ? AND page = ? AND field = ?
    `
    const existingParams = [organizationId, siteId, page, draft.field]

    if (locationId) {
      existingQuery += ` AND location_id = ?`
      existingParams.push(locationId)
    } else {
      existingQuery += ` AND location_id IS NULL`
    }

    const existing = await db.prepare(existingQuery).bind(...existingParams).first<{ id: string }>()

    const contentId = existing
      ? existing.id
      : `content::${organizationId}::${siteId}::${locationId ? locationId : 'site'}::${page}::${draft.field}`

    stmts.push(buildUpsertSiteStmt(db, {
      ...draft,
      id: contentId
    }))
  }
  
  let deleteQuery = `DELETE FROM site_content_drafts WHERE organization_id = ? AND site_id = ? AND page = ?`
  const deleteParams = [organizationId, siteId, page]
  
  if (locationId) {
    deleteQuery += ` AND location_id = ?`
    deleteParams.push(locationId)
  } else {
    deleteQuery += ` AND location_id IS NULL`
  }
  
  stmts.push(db.prepare(deleteQuery).bind(...deleteParams))
  
  console.log(`[content-management.ts] Executing db.batch with ${stmts.length} statements for publish...`)
  await db.batch(stmts)
  console.log(`[content-management.ts] db.batch completed successfully.`)
}

export const publishAllDrafts = async (db: D1Database, organizationId: string, siteId: string) => {
  const { results: drafts } = await db.prepare(
    `SELECT id, organization_id, site_id, location_id, page, field, value, type, source, content, hero_title, hero_subtitle, hero_image_asset_id, hero_video_asset_id, component, updated_at FROM site_content_drafts WHERE organization_id = ? AND site_id = ? ORDER BY location_id, page, field`
  ).bind(organizationId, siteId).all<SiteContent>()

  if (!drafts || drafts.length === 0) return

  const stmts = drafts.map(draft => {
    const locationSegment = draft.location_id ?? 'site'
    const canonicalId = `content::${organizationId}::${siteId}::${locationSegment}::${draft.page}::${draft.field}`
    return buildUpsertSiteStmt(db, { ...draft, id: canonicalId })
  })
  stmts.push(db.prepare(`DELETE FROM site_content_drafts WHERE organization_id = ? AND site_id = ?`).bind(organizationId, siteId))

  await db.batch(stmts)
}

export const discardDrafts = async (db: D1Database, organizationId: string, siteId: string, page: string, locationId?: string) => {
  let query = `DELETE FROM site_content_drafts WHERE organization_id = ? AND site_id = ? AND page = ?`
  const params = [organizationId, siteId, page]
  
  if (locationId) {
    query += ` AND location_id = ?`
    params.push(locationId)
  } else {
    query += ` AND location_id IS NULL`
  }
  
  await db.prepare(query).bind(...params).run()
}

export const discardAllDrafts = async (db: D1Database, organizationId: string, siteId: string) => {
  await db.prepare(`DELETE FROM site_content_drafts WHERE organization_id = ? AND site_id = ?`).bind(organizationId, siteId).run()
}

export const getDraftStatus = async (db: D1Database, organizationId: string, siteId: string, page?: string, locationId?: string): Promise<{ hasDrafts: boolean; count: number }> => {
  let query = `SELECT COUNT(*) as count FROM site_content_drafts WHERE organization_id = ? AND site_id = ?`
  const params = [organizationId, siteId]
  
  if (page) {
    query += ` AND page = ?`
    params.push(page)
  }
  
  if (locationId) {
    query += ` AND location_id = ?`
    params.push(locationId)
  } else if (locationId === undefined) {
    // Don't filter by location_id if not specified
  } else {
    query += ` AND location_id IS NULL`
  }
  
  const row = await db.prepare(query).bind(...params).first<{ count: number }>()
  return { hasDrafts: (row?.count ?? 0) > 0, count: row?.count ?? 0 }
}

