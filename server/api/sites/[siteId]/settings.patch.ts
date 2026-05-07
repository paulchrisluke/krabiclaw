// PATCH update site settings
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import type { UpdateSiteSettingsRequest } from '~/server/types/site'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const body = await readBody(event) as UpdateSiteSettingsRequest
  
  if (!siteId) {
    return jsonResponse({ 
      error: 'Site ID is required' 
    }, { status: 400 })
  }

  if (Object.keys(body).length === 0) {
    return jsonResponse({ 
      error: 'No update fields provided' 
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
  const headers = getHeaders(event)
  const session = await $fetch('/api/auth/get-session', {
    headers: {
      cookie: headers.cookie || '',
      authorization: headers.authorization || ''
    }
  })
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }

  try {
    // Verify user has admin/owner permissions for settings
    const site = await db.prepare(`
      SELECT s.id, s.organization_id FROM sites s
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

    // Build dynamic update query
    const setParts = []
    const params = []

    if (body.name !== undefined) {
      setParts.push('name = ?')
      params.push(body.name)
    }
    if (body.brand_name !== undefined) {
      setParts.push('brand_name = ?')
      params.push(body.brand_name)
    }
    if (body.brand_description !== undefined) {
      setParts.push('brand_description = ?')
      params.push(body.brand_description)
    }
    if (body.logo_url !== undefined) {
      setParts.push('logo_url = ?')
      params.push(body.logo_url)
    }
    if (body.contact_email !== undefined) {
      setParts.push('contact_email = ?')
      params.push(body.contact_email)
    }
    if (body.primary_location_id !== undefined) {
      setParts.push('primary_location_id = ?')
      params.push(body.primary_location_id)
    }

    setParts.push('updated_at = ?')
    setParts.push('updated_by = ?')
    params.push(new Date().toISOString(), session.user.id)

    params.push(siteId)

    const result = await db.prepare(`
      UPDATE sites 
      SET ${setParts.join(', ')}
      WHERE id = ? AND organization_id = ?
    `).bind(...params, site.organization_id).run()

    if (!result.success) {
      throw new Error('Failed to update site settings')
    }

    // Get updated settings
    const updatedSite = await db.prepare(`
      SELECT id, organization_id, name, subdomain, theme, status, 
             primary_location_id, public_url, custom_domain_status,
             brand_name, brand_description, logo_url, contact_email,
             last_published_at, created_at, updated_at
      FROM sites 
      WHERE id = ? AND organization_id = ?
      LIMIT 1
    `).bind(siteId, site.organization_id).first()

    if (!updatedSite) {
      throw new Error('Site not found after update')
    }

    const settings = {
      id: updatedSite.id,
      organization_id: updatedSite.organization_id,
      site_id: updatedSite.id,
      name: updatedSite.name,
      subdomain: updatedSite.subdomain,
      theme: updatedSite.theme || 'saya',
      status: updatedSite.status,
      primary_location_id: updatedSite.primary_location_id,
      public_url: updatedSite.public_url,
      custom_domain_status: updatedSite.custom_domain_status || 'none',
      brand_name: updatedSite.brand_name || updatedSite.name,
      brand_description: updatedSite.brand_description,
      logo_url: updatedSite.logo_url,
      contact_email: updatedSite.contact_email,
      last_published_at: updatedSite.last_published_at,
      created_at: updatedSite.created_at,
      updated_at: updatedSite.updated_at
    }
    
    return jsonResponse({
      success: true,
      settings,
      message: 'Site settings updated successfully'
    })
    
  } catch (error) {
    console.error('Failed to update site settings:', error)
    return jsonResponse({ 
      error: 'Failed to update site settings' 
    }, { status: 500 })
  }
})
