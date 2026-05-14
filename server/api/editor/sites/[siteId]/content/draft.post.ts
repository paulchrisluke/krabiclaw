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
  const db = env.REVIEWS_DB
  
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
      SELECT s.id, s.organization_id, s.name, s.status, s.onboarding_status
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

    const heroFields = ['hero.title', 'hero.subtitle', 'hero.video']
    const heroChange: Record<string, string | undefined> = {}
    let hasHeroChange = false

    for (const [field, value] of Object.entries(changes)) {
      if (heroFields.includes(field)) {
        hasHeroChange = true
        if (field === 'hero.title')       heroChange.hero_title = value || undefined
        if (field === 'hero.subtitle')    heroChange.hero_subtitle = value || undefined
        if (field === 'hero.image')       heroChange.hero_image_asset_id = value || undefined
        if (field === 'hero.video')       heroChange.hero_video_asset_id = value || undefined
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

    // Handle hero field changes
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
