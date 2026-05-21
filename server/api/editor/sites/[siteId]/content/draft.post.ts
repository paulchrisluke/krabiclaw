// POST save draft
import { cloudflareEnv, jsonResponse } from '../../../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { upsertDraftContent } from '../../../../../utils/content-management'
import { getFieldDef } from '~/config/content-registry'

interface DraftRequest {
  page: string
  changes: Record<string, string>
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const body = await readBody(event) as DraftRequest
  const { page, changes } = body
  
  if (!siteId || !page || !changes) {
    return jsonResponse({ 
      error: 'Site ID, page, and changes are required' 
    }, { status: 400 })
  }
  
  const env = cloudflareEnv(event)
  const db = env.DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  // Get authenticated user
  const session = await getAuthSession(event, env)
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }

  try {
    // Verify user belongs to organization that owns the site
    const site = await db.prepare(`
      SELECT s.id, s.organization_id, s.status, s.onboarding_status
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin', 'editor')
      LIMIT 1
    `).bind(siteId, session.user.id).first<{ id: string; organization_id: string; name: string; status: string; onboarding_status: string | null }>()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    const locationId = getQuery(event).locationId as string || undefined
    const draftIdPrefix = [
      'draft',
      site.organization_id,
      siteId,
      locationId || 'site',
      page
    ].join('::')

    // For the location page, hero image/video are stored directly on business_locations
    // (the source of truth the public page reads). Write them there immediately and skip
    // the draft/publish cycle for those two fields only.
    const isLocationHeroPage = page === 'location' && !!locationId
    const locationHeroImageId = isLocationHeroPage && 'hero.image' in changes
      ? (changes['hero.image'] || null)
      : undefined
    const locationHeroVideoId = isLocationHeroPage && 'hero.video' in changes
      ? (changes['hero.video'] || null)
      : undefined

    if (locationHeroImageId !== undefined || locationHeroVideoId !== undefined) {
      // Validate that non-null asset IDs belong to this organization before writing
      if (locationHeroImageId) {
        const asset = await db.prepare(
          `SELECT id FROM media_assets WHERE id = ? AND organization_id = ? AND status = 'active' LIMIT 1`
        ).bind(locationHeroImageId, site.organization_id).first()
        if (!asset) return jsonResponse({ error: 'Invalid or unauthorized hero image asset' }, { status: 400 })
      }
      if (locationHeroVideoId) {
        const asset = await db.prepare(
          `SELECT id FROM media_assets WHERE id = ? AND organization_id = ? AND status = 'active' LIMIT 1`
        ).bind(locationHeroVideoId, site.organization_id).first()
        if (!asset) return jsonResponse({ error: 'Invalid or unauthorized hero video asset' }, { status: 400 })
      }

      const setClauses: string[] = []
      const bindParams: (string | null)[] = []
      const now = new Date().toISOString()
      if (locationHeroImageId !== undefined) { setClauses.push('hero_image_asset_id = ?'); bindParams.push(locationHeroImageId) }
      if (locationHeroVideoId !== undefined) { setClauses.push('hero_video_asset_id = ?'); bindParams.push(locationHeroVideoId) }
      setClauses.push('updated_at = ?')
      bindParams.push(now, locationId!, siteId)
      await db.prepare(
        `UPDATE business_locations SET ${setClauses.join(', ')} WHERE id = ? AND site_id = ?`
      ).bind(...bindParams).run()
    }

    const heroFields = ['hero.title', 'hero.subtitle']
    const heroChange: Record<string, string | undefined> = {}
    let hasHeroChange = false

    for (const [field, value] of Object.entries(changes)) {
      // hero.image / hero.video on a location page were already handled above
      if (isLocationHeroPage && (field === 'hero.image' || field === 'hero.video')) continue

      if (heroFields.includes(field) || field === 'hero.image' || field === 'hero.video') {
        hasHeroChange = true
        if (field === 'hero.title')    heroChange.hero_title = value || undefined
        if (field === 'hero.subtitle') heroChange.hero_subtitle = value || undefined
        if (field === 'hero.image')    heroChange.hero_image_asset_id = value || undefined
        if (field === 'hero.video')    heroChange.hero_video_asset_id = value || undefined
      } else {
        const fieldDef = getFieldDef(page, field)
        await upsertDraftContent(db, {
          id: `${draftIdPrefix}::${field}`,
          organization_id: site.organization_id,
          site_id: siteId,
          location_id: locationId,
          page,
          field,
          value,
          type: fieldDef?.type || 'text',
          source: 'manual',
          content: value,
          hero_title: undefined,
          hero_subtitle: undefined,
          hero_image_asset_id: undefined,
          hero_video_asset_id: undefined
        })
      }
    }

    // Handle hero text field changes (title/subtitle only — image/video routed above for location pages)
    if (hasHeroChange) {
      await upsertDraftContent(db, {
        id: `${draftIdPrefix}::hero`,
        organization_id: site.organization_id,
        site_id: siteId,
        location_id: locationId,
        page,
        field: 'hero',
        type: 'text',
        source: 'manual',
        content: undefined,
        ...heroChange
      })
    }
    
    return jsonResponse({
      success: true,
      message: 'Draft saved successfully',
      changesCount: Object.keys(changes).length
    })
    
  } catch (error) {
    console.error('Failed to save draft:', error)
    return jsonResponse({ 
      error: 'Failed to save draft' 
    }, { status: 500 })
  }
})
