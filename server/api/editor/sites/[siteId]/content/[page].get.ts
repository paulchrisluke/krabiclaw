// Get draft + published merged content for authenticated editor preview
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getPageContent, getDraftContent } from '~/server/utils/content-management'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const page = getRouterParam(event, 'page')
  const locationId = getQuery(event).locationId as string || undefined
  
  if (!siteId || !page) {
    return jsonResponse({ 
      error: 'Site ID and page are required' 
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
      WHERE s.id = ? AND om.userId = ? AND om.role = 'owner'
      LIMIT 1
    `).bind(siteId, session.user.id).first<{ id: string; organization_id: string; name: string; status: string; onboarding_status: string | null }>()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    // Get published content
    const publishedContent = await getPageContent(db, site.organization_id, siteId, page, locationId)
    
    // Get draft content
    const drafts = await getDraftContent(db, site.organization_id, siteId, page, locationId)
    
    // Merge drafts over published content
    const mergedContent = [...publishedContent]
    for (const draft of drafts) {
      const index = mergedContent.findIndex(c => c.field === draft.field)
      if (index !== -1) {
        mergedContent[index] = { ...mergedContent[index], ...draft }
      } else {
        mergedContent.push(draft)
      }
    }

    // For location pages, hero image/video live in business_locations (the source of truth
    // the public page reads). Overlay them into the merged hero row so the editor shows
    // the current asset and writes back to the correct place.
    if (page === 'location' && locationId) {
      const locHero = await db.prepare(`
        SELECT bl.hero_image_asset_id, bl.hero_video_asset_id,
               img.public_url AS hero_public_url, img.kind AS hero_kind,
               vid.public_url AS hero_video_public_url, vid.kind AS hero_video_kind
        FROM business_locations bl
        LEFT JOIN media_assets img ON bl.hero_image_asset_id = img.id AND img.status = 'active'
        LEFT JOIN media_assets vid ON bl.hero_video_asset_id = vid.id AND vid.status = 'active'
        WHERE bl.id = ? AND bl.site_id = ?
        LIMIT 1
      `).bind(locationId, siteId).first<{
        hero_image_asset_id: string | null
        hero_video_asset_id: string | null
        hero_public_url: string | null
        hero_kind: string | null
        hero_video_public_url: string | null
        hero_video_kind: string | null
      }>()

      if (locHero) {
        const heroIdx = mergedContent.findIndex(c => c.field === 'hero')
        const existing = heroIdx !== -1 ? mergedContent[heroIdx]! : null
        const overlaid = {
          id: existing?.id ?? `bl-hero-${locationId}`,
          organization_id: existing?.organization_id ?? site.organization_id,
          site_id: existing?.site_id ?? siteId,
          location_id: existing?.location_id ?? locationId,
          page: existing?.page ?? page,
          field: 'hero',
          type: existing?.type ?? 'text',
          source: existing?.source ?? 'manual',
          content: existing?.content,
          value: existing?.value,
          hero_title: existing?.hero_title,
          hero_subtitle: existing?.hero_subtitle,
          hero_image_asset_id: locHero.hero_image_asset_id ?? undefined,
          hero_public_url: locHero.hero_public_url ?? null,
          hero_kind: locHero.hero_kind ?? null,
          hero_video_asset_id: locHero.hero_video_asset_id ?? undefined,
          hero_video_public_url: locHero.hero_video_public_url ?? null,
          hero_video_kind: locHero.hero_video_kind ?? null,
          updated_at: existing?.updated_at ?? new Date().toISOString(),
        }
        if (heroIdx !== -1) mergedContent[heroIdx] = overlaid
        else mergedContent.push(overlaid)
      }
    }

    return jsonResponse({
      success: true,
      content: mergedContent,
      hasDrafts: drafts.length > 0,
      siteId,
      locationId,
      page
    })
    
  } catch (error) {
    console.error('Failed to get editor content:', error)
    return jsonResponse({ 
      error: 'Failed to get editor content' 
    }, { status: 500 })
  }
})
