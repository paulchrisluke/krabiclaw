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
  hero_video_url?: string
  updated_at: string
}

export interface StaffProfile {
  id: string
  name: string
  role: string
  bio?: string
  image_url?: string
  order_index: number
  active: boolean
  updated_at: string
}

export interface AwardRecognition {
  id: string
  title: string
  description?: string
  year?: number
  issuer?: string
  image_url?: string
  order_index: number
  active: boolean
  updated_at: string
}

// Site Content
export const getSiteContent = async (db: D1Database, organizationId: string, siteId: string, locationId?: string): Promise<SiteContent[]> => {
  let query = `
    SELECT id, organization_id, site_id, location_id, page, field, content, hero_title, hero_subtitle, hero_video_url, updated_at 
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
    SELECT id, organization_id, site_id, location_id, page, field, content, hero_title, hero_subtitle, hero_video_url, updated_at 
     FROM site_content 
     WHERE organization_id = ? AND site_id = ? AND page = ?
  `
  const params = [organizationId, siteId, page]
  
  if (locationId) {
    query += ` AND location_id = ?`
    params.push(locationId)
  } else {
    query += ` AND location_id IS NULL`
  }
  
  query += ` ORDER BY field`
  
  const { results } = await db.prepare(query).bind(...params).all<SiteContent>()
  return results ?? []
}

export const getSiteContentField = async (db: D1Database, organizationId: string, siteId: string, locationId: string | null, page: string, field: string): Promise<SiteContent | null> => {
  let query = `
    SELECT id, organization_id, site_id, location_id, page, field, content, hero_title, hero_subtitle, hero_video_url, updated_at 
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



// Draft Management
export const getDraftContent = async (db: D1Database, organizationId: string, siteId: string, page: string, locationId?: string): Promise<SiteContent[]> => {
  let query = `
    SELECT id, organization_id, site_id, location_id, page, field, content, hero_title, hero_subtitle, hero_video_url, updated_at 
     FROM site_content_drafts 
     WHERE organization_id = ? AND site_id = ? AND page = ?
  `
  const params = [organizationId, siteId, page]
  
  if (locationId) {
    query += ` AND location_id = ?`
    params.push(locationId)
  } else {
    query += ` AND location_id IS NULL`
  }
  
  query += ` ORDER BY field`
  
  const { results } = await db.prepare(query).bind(...params).all<SiteContent>()
  return results ?? []
}

export const buildUpsertDraftStmt = (db: D1Database, content: Omit<SiteContent, 'updated_at'>) => {
  return db.prepare(`
    INSERT INTO site_content_drafts (id, organization_id, site_id, location_id, page, field, value, type, source, content, hero_title, hero_subtitle, hero_video_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, site_id, location_id, page, field) DO UPDATE SET 
      content = excluded.content,
      hero_title = excluded.hero_title,
      hero_subtitle = excluded.hero_subtitle,
      hero_video_url = excluded.hero_video_url,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).bind(
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
    content.hero_video_url || null
  )
}

export const upsertDraftContent = async (db: D1Database, content: Omit<SiteContent, 'updated_at'>) => {
  await buildUpsertDraftStmt(db, content).run()
}

export const buildUpsertSiteStmt = (db: D1Database, content: Omit<SiteContent, 'updated_at'>) => {
  return db.prepare(`
    INSERT INTO site_content (id, organization_id, site_id, location_id, page, field, value, type, source, content, hero_title, hero_subtitle, hero_video_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, site_id, location_id, page, field) DO UPDATE SET 
      content = excluded.content,
      hero_title = excluded.hero_title,
      hero_subtitle = excluded.hero_subtitle,
      hero_video_url = excluded.hero_video_url,
      value = excluded.value,
      type = excluded.type,
      source = excluded.source,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).bind(
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
    content.hero_video_url || null
  )
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
  
  const stmts = drafts.map(draft => buildUpsertSiteStmt(db, draft))
  
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

export const publishAllDrafts = async (db: D1Database) => {
  const { results: drafts } = await db.prepare(
    `SELECT id, organization_id, site_id, location_id, page, field, content, hero_title, hero_subtitle, hero_video_url, updated_at FROM site_content_drafts ORDER BY organization_id, site_id, location_id, page, field`
  ).all<SiteContent>()
  
  if (!drafts || drafts.length === 0) return

  const stmts = drafts.map(draft => buildUpsertSiteStmt(db, draft))
  stmts.push(db.prepare(`DELETE FROM site_content_drafts`))
  
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

export const discardAllDrafts = async (db: D1Database) => {
  await db.prepare(`DELETE FROM site_content_drafts`).run()
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

// Staff Profiles
export const getStaffProfiles = async (db: D1Database, organizationId: string, siteId: string, locationId?: string): Promise<StaffProfile[]> => {
  let query = `
    SELECT id, name, role, bio, image_url, order_index, active, updated_at 
     FROM staff_profiles 
     WHERE organization_id = ? AND site_id = ?
  `
  const params = [organizationId, siteId]
  
  if (locationId) {
    query += ` AND location_id = ?`
    params.push(locationId)
  } else {
    query += ` AND location_id IS NULL`
  }
  
  query += ` ORDER BY order_index, name`
  
  const { results } = await db.prepare(query).bind(...params).all<StaffProfile>()
  return results ?? []
}

export const upsertStaffProfile = async (db: D1Database, profile: Omit<StaffProfile, 'updated_at'> & { organization_id: string; site_id: string; location_id?: string }) => {
  await db.prepare(`
    INSERT INTO staff_profiles (id, organization_id, site_id, location_id, name, role, bio, image_url, order_index, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET 
      name = excluded.name,
      role = excluded.role,
      bio = excluded.bio,
      image_url = excluded.image_url,
      order_index = excluded.order_index,
      active = excluded.active,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(
    profile.id || crypto.randomUUID(),
    profile.organization_id,
    profile.site_id,
    profile.location_id || null,
    profile.name,
    profile.role,
    profile.bio || null,
    profile.image_url || null,
    profile.order_index,
    profile.active ? 1 : 0
  ).run()
}

export const deleteStaffProfile = async (db: D1Database, organizationId: string, siteId: string, id: string) => {
  await db.prepare(`DELETE FROM staff_profiles WHERE organization_id = ? AND site_id = ? AND id = ?`).bind(organizationId, siteId, id).run()
}

// Awards & Recognition
export const getAwardsRecognition = async (db: D1Database, organizationId: string, siteId: string, locationId?: string): Promise<AwardRecognition[]> => {
  let query = `
    SELECT id, title, description, year, issuer, image_url, order_index, active, updated_at 
     FROM awards_recognition 
     WHERE organization_id = ? AND site_id = ?
  `
  const params = [organizationId, siteId]
  
  if (locationId) {
    query += ` AND location_id = ?`
    params.push(locationId)
  } else {
    query += ` AND location_id IS NULL`
  }
  
  query += ` ORDER BY order_index, year DESC`
  
  const { results } = await db.prepare(query).bind(...params).all<AwardRecognition>()
  return results ?? []
}

export const upsertAwardRecognition = async (db: D1Database, award: Omit<AwardRecognition, 'updated_at'> & { organization_id: string; site_id: string; location_id?: string }) => {
  await db.prepare(`
    INSERT INTO awards_recognition (id, organization_id, site_id, location_id, title, description, year, issuer, image_url, order_index, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET 
      title = excluded.title,
      description = excluded.description,
      year = excluded.year,
      issuer = excluded.issuer,
      image_url = excluded.image_url,
      order_index = excluded.order_index,
      active = excluded.active,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(
    award.id || crypto.randomUUID(),
    award.organization_id,
    award.site_id,
    award.location_id || null,
    award.title,
    award.description || null,
    award.year || null,
    award.issuer || null,
    award.image_url || null,
    award.order_index,
    award.active ? 1 : 0
  ).run()
}

export const deleteAwardRecognition = async (db: D1Database, organizationId: string, siteId: string, id: string) => {
  await db.prepare(`DELETE FROM awards_recognition WHERE organization_id = ? AND site_id = ? AND id = ?`).bind(organizationId, siteId, id).run()
}

