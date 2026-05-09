// POST publish page
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { publishDrafts } from '~/server/utils/content-management'
import { sendWhatsAppNotification, getOrgWhatsAppPhone } from '~/server/utils/whatsapp'

interface PublishRequest {
  page: string
  all?: boolean
  locationId?: string | null
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const body = await readBody(event) as PublishRequest
  const { page, all, locationId: bodyLocationId } = body
  
  // Get locationId from query or body
  const locationId = (getQuery(event).locationId as string || bodyLocationId || undefined)
  
  if (!siteId || (!page && !all)) {
    return jsonResponse({ 
      error: 'Site ID and page (or all flag) are required' 
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
    // Verify user belongs to organization that owns this site (owner/dashboard only for publish)
    const site = await db.prepare(`
      SELECT s.id, s.organization_id, s.name, s.status, s.onboarding_status
      FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin')
      LIMIT 1
    `).bind(siteId, session.user.id).first()
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    if (all) {
      // Publish all drafts for this site
      // Note: This would need to be implemented in content-management
      return jsonResponse({
        error: 'Publish all not yet implemented'
      }, { status: 501 })
    } else {
      // Publish specific page
      await publishDrafts(db, site.organization_id, siteId, page, locationId)

      // Fire WhatsApp notification — non-blocking, never fails the publish
      getOrgWhatsAppPhone(db, site.organization_id, siteId).then((phone) => {
        if (!phone) return
        sendWhatsAppNotification(env, db, {
          organizationId: site.organization_id,
          siteId,
          toPhone: phone,
          template: 'draft_published',
          vars: {
            site_name: site.name ?? siteId,
            url: `https://${env.NUXT_PUBLIC_PLATFORM_DOMAIN ? env.NUXT_PUBLIC_PLATFORM_DOMAIN.replace('https://', '') : 'krabiclaw.com'}`,
          },
        }).catch(console.error)
      }).catch(console.error)

      return jsonResponse({
        success: true,
        message: 'Page published successfully',
        page,
        locationId
      })
    }
    
  } catch (error) {
    console.error('Failed to publish:', error)
    return jsonResponse({ 
      error: 'Failed to publish' 
    }, { status: 500 })
  }
})
