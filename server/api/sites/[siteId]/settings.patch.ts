// PATCH update site settings
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { deleteConfig, getConfig, setConfig } from '~/server/utils/site-config'
import { createSystemSubdomain } from '~/server/utils/domains'
import { isCurrencyCode } from '~/shared/currencies'
import { isDemoOrg } from '~/server/utils/demo'
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
  const session = await getAuthSession(event, env)
  
  if (!session?.user?.id) {
    return jsonResponse({ 
      error: 'Authentication required' 
    }, { status: 401 })
  }

  try {
    // Verify user has admin/owner permissions for settings
    const site = await db.prepare(`
      SELECT s.id, s.organization_id, s.subdomain, s.settings FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin')
      LIMIT 1
    `).bind(siteId, session.user.id).first<{ id: string; organization_id: string; subdomain: string | null; settings: string | null }>()
    
    if (!site) {
      return jsonResponse({
        error: 'Site not found or access denied'
      }, { status: 404 })
    }

    // Demo org is read-only for everyone except platform admins
    const isPlatformAdmin = (session.user as { role?: string }).role === 'admin'
    if (isDemoOrg(site.organization_id) && !isPlatformAdmin) {
      return jsonResponse({ error: 'Demo site is read-only' }, { status: 403 })
    }

    // Build dynamic update query
    const setParts = []
    const params = []

    if (body.brand_name !== undefined) {
      const slug = body.brand_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30)
      if (!slug) {
        return jsonResponse({
          error: 'Brand name must contain at least one alphanumeric character'
        }, { status: 400 })
      }
      const existing = await db.prepare(`
        SELECT id FROM sites WHERE subdomain = ? AND id != ? AND organization_id = ?
        LIMIT 1
      `).bind(slug, siteId, site.organization_id).first()
      if (existing) {
        return jsonResponse({
          error: 'This brand name is already in use'
        }, { status: 400 })
      }
      setParts.push('brand_name = ?', 'subdomain = ?')
      params.push(body.brand_name, slug)
    }
    if (body.brand_description !== undefined) {
      setParts.push('brand_description = ?')
      params.push(body.brand_description)
    }
    if (body.logo_asset_id !== undefined) {
      if (body.logo_asset_id !== null && body.logo_asset_id !== '') {
        const asset = await db.prepare(`
          SELECT id
          FROM media_assets
          WHERE id = ? AND organization_id = ? AND site_id = ? AND status = 'active' AND kind = 'image'
          LIMIT 1
        `).bind(body.logo_asset_id, site.organization_id, siteId).first()

        if (!asset) {
          return jsonResponse({
            error: 'Logo asset not found, unauthorized, or not an image'
          }, { status: 400 })
        }
      }
      setParts.push('logo_asset_id = ?')
      params.push(body.logo_asset_id || null)
    }
    if (body.logo_url !== undefined) {
      setParts.push('logo_url = ?')
      params.push(body.logo_url)
    }
    if (body.contact_email !== undefined) {
      setParts.push('contact_email = ?')
      params.push(body.contact_email)
    }
    if (body.brand_color !== undefined) {
      if (body.brand_color) {
        await setConfig(db, site.organization_id as string, siteId, 'brand_color', body.brand_color)
      } else {
        await deleteConfig(db, site.organization_id as string, siteId, 'brand_color')
      }
    }
    if (body.default_currency !== undefined) {
      if (typeof body.default_currency !== 'string') {
        return jsonResponse({
          error: 'Invalid default currency'
        }, { status: 400 })
      }
      const currency = body.default_currency.toUpperCase().trim()
      if (!isCurrencyCode(currency)) {
        return jsonResponse({
          error: 'Invalid default currency'
        }, { status: 400 })
      }
      await setConfig(db, site.organization_id as string, siteId, 'default_currency', currency)
    }
    if (body.primary_location_id !== undefined) {
      if (body.primary_location_id !== null && body.primary_location_id !== '') {
        const location = await db.prepare(`
          SELECT id
          FROM business_locations
          WHERE id = ? AND organization_id = ? AND site_id = ? AND status = 'active'
          LIMIT 1
        `).bind(body.primary_location_id, site.organization_id, siteId).first()

        if (!location) {
          return jsonResponse({
            error: 'Primary location not found'
          }, { status: 400 })
        }
      }
      setParts.push('primary_location_id = ?')
      params.push(body.primary_location_id || null)
    }
    if (body.url_structure !== undefined) {
      if (!['location_subdirectories', 'brand_pages'].includes(body.url_structure)) {
        return jsonResponse({
          error: 'Invalid URL structure'
        }, { status: 400 })
      }

      const settings = site.settings ? JSON.parse(String(site.settings)) : {}
      settings.url_structure = body.url_structure
      setParts.push('settings = ?')
      params.push(JSON.stringify(settings))
    }

    if (body.last_published_at !== undefined) {
      setParts.push('last_published_at = ?')
      params.push(body.last_published_at)
    }
    const socialUrlKeys = new Set(['social_facebook', 'social_instagram', 'social_tiktok'])
    for (const key of ['social_facebook', 'social_instagram', 'social_tiktok', 'footer_tagline'] as const) {
      if (body[key] !== undefined) {
        const value = body[key]
        if (value) {
          if (socialUrlKeys.has(key)) {
            try {
              const url = new URL(value)
              if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
                await deleteConfig(db, site.organization_id as string, siteId, key)
                continue
              }
            } catch {
              await deleteConfig(db, site.organization_id as string, siteId, key)
              continue
            }
          }
          await setConfig(db, site.organization_id as string, siteId, key, value)
        } else {
          await deleteConfig(db, site.organization_id as string, siteId, key)
        }
      }
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

    // Only re-register the subdomain when it actually changed to avoid hitting
    // the CF Pages API on every save (which errors if the domain is already registered).
    if (body.brand_name !== undefined) {
      const slug = body.brand_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30)
      if (slug !== site.subdomain) {
        await createSystemSubdomain(env, db, siteId, site.organization_id as string, slug)
      }
    }

    // Get updated settings
    const updatedSite = await db.prepare(`
      SELECT id, organization_id, subdomain, theme, status,
             primary_location_id, public_url, custom_domain_status,
             brand_name, brand_description, logo_url, logo_asset_id, contact_email,
             settings, last_published_at, created_at, updated_at
      FROM sites
      WHERE id = ? AND organization_id = ?
      LIMIT 1
    `).bind(siteId, site.organization_id).first()

    if (!updatedSite) {
      throw new Error('Site not found after update')
    }

    const siteSettings = updatedSite.settings ? JSON.parse(String(updatedSite.settings)) : {}
    const siteConfig = await getConfig(db, updatedSite.organization_id as string, updatedSite.id as string)

    const settings = {
      id: updatedSite.id,
      organization_id: updatedSite.organization_id,
      site_id: updatedSite.id,
      subdomain: updatedSite.subdomain,
      theme: updatedSite.theme || 'saya',
      status: updatedSite.status,
      primary_location_id: updatedSite.primary_location_id,
      public_url: updatedSite.public_url,
      custom_domain_status: updatedSite.custom_domain_status || 'none',
      brand_name: updatedSite.brand_name,
      brand_description: updatedSite.brand_description,
      logo_url: updatedSite.logo_url,
      logo_asset_id: updatedSite.logo_asset_id,
      contact_email: updatedSite.contact_email,
      brand_color: siteConfig.brand_color || '',
      default_currency: siteConfig?.default_currency || 'THB',
      url_structure: siteSettings.url_structure || 'location_subdirectories',
      social_facebook: siteConfig.social_facebook || '',
      social_instagram: siteConfig.social_instagram || '',
      social_tiktok: siteConfig.social_tiktok || '',
      footer_tagline: siteConfig.footer_tagline || '',
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
