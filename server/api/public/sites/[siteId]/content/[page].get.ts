// Get published content for public tenant rendering (no auth required)
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getDraftContent, getPublishedPageContentForLocale } from '~/server/utils/content-management'
import { verifyPreviewToken } from '~/server/utils/preview-token'
import { resolveSiteLocale } from '~/server/utils/site-i18n'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const page = getRouterParam(event, 'page')
  const query = getQuery(event)
  const locationSlug = typeof query.location === 'string' && query.location ? query.location : undefined
  const requestedLocale = typeof query.locale === 'string' ? query.locale : undefined
  
  // Initialize env first
  const env = cloudflareEnv(event)
  
  const preview = query.preview === 'true'
  const previewToken = typeof query.token === 'string' && query.token ? query.token : undefined
  
  let isPreviewAuthorized = false
  if (preview && previewToken) {
    const previewSecret = env.PREVIEW_SECRET
    if (!previewSecret) {
      console.error('Critical: PREVIEW_SECRET is not configured in this environment.')
      return jsonResponse({ 
        error: 'Site configuration error: Preview secret missing' 
      }, { status: 500 })
    }
    isPreviewAuthorized = await verifyPreviewToken(String(previewSecret), String(siteId), previewToken)
  }
  
  if (preview && !isPreviewAuthorized) {
    return jsonResponse({ 
      error: 'Unauthorized preview access' 
    }, { status: 401 })
  }
  
  if (!siteId || !page) {
    return jsonResponse({ 
      error: 'Site ID and page are required' 
    }, { status: 400 })
  }
  
  const db = env.REVIEWS_DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  try {
    // Get site info (public access)
    const site = await db.prepare(`
      SELECT id, organization_id, status, onboarding_status
      FROM sites 
      WHERE id = ? AND status = 'active' AND onboarding_status = 'active'
      LIMIT 1
    `).bind(siteId).first<{ id: string; organization_id: string; status: string; onboarding_status: string }>()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or not active' 
      }, { status: 404 })
    }

    // Find location by slug if provided
    let locationId: string | undefined
    if (locationSlug) {
      const location = await db.prepare(`
        SELECT id FROM business_locations 
        WHERE site_id = ? AND slug = ? AND status = 'active'
        LIMIT 1
      `).bind(siteId, locationSlug).first<{ id: string }>()
      
      if (location) {
        locationId = location.id
      }
    }

    const localeState = await resolveSiteLocale(db, site, requestedLocale)

    // Get published content
    const publishedContent = await getPublishedPageContentForLocale(db, site.organization_id, siteId, page, {
      locale: localeState.effectiveLocale,
      sourceLocale: localeState.sourceLocale,
      fallbackEnabled: localeState.fallbackEnabled,
      locationId,
    })
    
    // In preview mode, also fetch and merge drafts
    let content = publishedContent
    if (isPreviewAuthorized) {
      content = [...publishedContent]
      if (localeState.effectiveLocale === localeState.sourceLocale) {
        // Source locale preview: merge drafts from site_content_drafts
        const drafts = await getDraftContent(db, site.organization_id, siteId, page, locationId)
        for (const draft of drafts) {
          const index = content.findIndex(c => c.field === draft.field)
          if (index !== -1) {
            content[index] = { ...content[index], ...draft }
          } else {
            content.push(draft)
          }
        }
      } else {
        // Translation locale preview: merge drafts from site_content_translations where status = 'draft'
        let transQuery = `
          SELECT field, content, value, type, hero_title, hero_subtitle, updated_at
          FROM site_content_translations
          WHERE organization_id = ? AND site_id = ? AND page = ? AND locale = ? AND status = 'draft'
        `
        const params = [site.organization_id, siteId, page, localeState.effectiveLocale]
        if (locationId) {
          transQuery += ` AND location_id = ?`
          params.push(locationId)
        } else {
          transQuery += ` AND location_id IS NULL`
        }

        const { results: transDrafts } = await db.prepare(transQuery).bind(...params).all<{
          field: string
          content: string | null
          value: string | null
          type: string | null
          hero_title: string | null
          hero_subtitle: string | null
          updated_at: string
        }>()

        if (transDrafts) {
          for (const draft of transDrafts) {
            const index = content.findIndex(c => c.field === draft.field)
            if (index !== -1) {
              const base = content[index]
              if (base) {
                content[index] = {
                  ...base,
                  value: (draft.value ?? draft.content ?? base.value) ?? undefined,
                  content: (draft.content ?? draft.value ?? base.content) ?? undefined,
                  type: draft.type ?? base.type ?? 'text',
                  hero_title: (draft.hero_title ?? base.hero_title) ?? undefined,
                  hero_subtitle: (draft.hero_subtitle ?? base.hero_subtitle) ?? undefined,
                  updated_at: draft.updated_at,
                }
              }
            } else {
              content.push({
                id: `translation::${site.organization_id}::${siteId}::${locationId ?? 'site'}::${localeState.effectiveLocale}::${page}::${draft.field}`,
                organization_id: site.organization_id,
                site_id: siteId,
                location_id: locationId ?? undefined,
                page,
                field: draft.field,
                source: 'manual',
                value: (draft.value ?? draft.content) ?? undefined,
                content: (draft.content ?? draft.value) ?? undefined,
                type: draft.type ?? 'text',
                hero_title: draft.hero_title ?? undefined,
                hero_subtitle: draft.hero_subtitle ?? undefined,
                updated_at: draft.updated_at,
              })
            }
          }
        }
      }
    }
    
    return jsonResponse({
      success: true,
      content,
      siteId,
      locationId,
      page,
      locale: localeState.effectiveLocale,
      requestedLocale: localeState.requestedLocale,
      sourceLocale: localeState.sourceLocale,
      preview
    })
    
  } catch (error) {
    console.error('Failed to get public content:', error)
    return jsonResponse({ 
      error: 'Failed to get content' 
    }, { status: 500 })
  }
})
