import { deleteConfig, getConfig, setConfig } from '~/server/utils/site-config'
import { createSystemSubdomain } from '~/server/utils/domains'
import { isCurrencyCode } from '~/shared/currencies'
import type { UpdateSiteSettingsRequest } from '~/server/types/site'

type SetupEnv = Parameters<typeof createSystemSubdomain>[0]

const MAX_SLUG_ATTEMPTS = 10

interface SiteSettingsRow {
  id: string
  organization_id: string
  subdomain: string | null
  brand_name: string | null
  settings: string | null
}

interface FullSiteRow extends SiteSettingsRow {
  theme: string | null
  status: string
  primary_location_id: string | null
  public_url: string | null
  custom_domain_status: string | null
  default_currency: string | null
  brand_description: string | null
  logo_url: string | null
  logo_asset_id: string | null
  contact_email: string | null
  last_published_at: string | null
  created_at: string
  updated_at: string
}

export interface SiteSettingsUpdateResult {
  status: number
  data: Record<string, unknown>
}

interface SiteSettingsUpdateOptions {
  forceSubdomainRegistrationFailure?: boolean
}

function buildSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 30)
}

async function loadSettingsPayload(
  db: D1Database,
  organizationId: string,
  siteId: string
) {
  const updatedSite = await db.prepare(`
    SELECT id, organization_id, subdomain, theme, status,
           primary_location_id, public_url, custom_domain_status, default_currency,
           brand_name, brand_description, logo_url, logo_asset_id, contact_email,
           settings, last_published_at, created_at, updated_at
    FROM sites
    WHERE id = ? AND organization_id = ?
    LIMIT 1
  `).bind(siteId, organizationId).first<FullSiteRow>()

  if (!updatedSite) {
    throw new Error('Site not found after update')
  }

  let siteSettings: Record<string, unknown> = {}
  if (updatedSite.settings) {
    try {
      siteSettings = JSON.parse(String(updatedSite.settings))
    } catch {
      siteSettings = {}
    }
  }

  const siteConfig = await getConfig(db, organizationId, siteId)

  return {
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
    default_currency: updatedSite.default_currency || 'THB',
    url_structure: siteSettings.url_structure || 'location_subdirectories',
    social_facebook: siteConfig.social_facebook || '',
    social_instagram: siteConfig.social_instagram || '',
    social_tiktok: siteConfig.social_tiktok || '',
    footer_tagline: siteConfig.footer_tagline || '',
    press_email: siteConfig.press_email || '',
    partnerships_email: siteConfig.partnerships_email || '',
    catering_email: siteConfig.catering_email || '',
    careers_email: siteConfig.careers_email || '',
    google_analytics_measurement_id: siteConfig.google_analytics_measurement_id || '',
    google_site_verification: siteConfig.google_site_verification || '',
    last_published_at: updatedSite.last_published_at,
    created_at: updatedSite.created_at,
    updated_at: updatedSite.updated_at,
  }
}

async function updateNonSiteConfigFields(
  db: D1Database,
  organizationId: string,
  siteId: string,
  updates: UpdateSiteSettingsRequest
): Promise<SiteSettingsUpdateResult | null> {
  if (updates.brand_color !== undefined) {
    if (updates.brand_color) {
      await setConfig(db, organizationId, siteId, 'brand_color', updates.brand_color)
    } else {
      await deleteConfig(db, organizationId, siteId, 'brand_color')
    }
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  for (const key of ['press_email', 'partnerships_email', 'catering_email', 'careers_email'] as const) {
    if (updates[key] !== undefined && updates[key] !== null) {
      const emailVal = String(updates[key]).trim()
      if (emailVal !== '' && !emailPattern.test(emailVal)) {
        return {
          status: 400,
          data: { error: `Invalid email address for ${key.replace('_', ' ')}` },
        }
      }
    }
  }

  const socialUrlKeys = new Set(['social_facebook', 'social_instagram', 'social_tiktok'])
  for (const key of ['social_facebook', 'social_instagram', 'social_tiktok', 'footer_tagline', 'press_email', 'partnerships_email', 'catering_email', 'careers_email', 'google_analytics_measurement_id', 'google_site_verification'] as const) {
    if (updates[key] !== undefined) {
      const value = updates[key]
      if (value) {
        if (socialUrlKeys.has(key)) {
          const valueString = String(value)
          try {
            const url = new URL(valueString)
            if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
              return {
                status: 400,
                data: { error: `Invalid URL for ${key}: ${valueString}` },
              }
            }
          } catch {
            return {
              status: 400,
              data: { error: `Invalid URL for ${key}: ${valueString}` },
            }
          }
        }
        await setConfig(db, organizationId, siteId, key, value)
      } else {
        await deleteConfig(db, organizationId, siteId, key)
      }
    }
  }

  return null
}

async function attemptSiteUpdate(
  db: D1Database,
  env: SetupEnv,
  site: SiteSettingsRow,
  siteId: string,
  organizationId: string,
  updates: UpdateSiteSettingsRequest,
  userId: string,
  subdomain: string | null,
  options: SiteSettingsUpdateOptions
): Promise<SiteSettingsUpdateResult> {
  const setParts: string[] = []
  const params: Array<string | null> = []

  if (updates.brand_name !== undefined) {
    setParts.push('brand_name = ?', 'subdomain = ?')
    params.push(updates.brand_name, subdomain)
  }
  if (updates.brand_description !== undefined) {
    setParts.push('brand_description = ?')
    params.push(updates.brand_description ?? null)
  }
  if (updates.logo_asset_id !== undefined) {
    if (updates.logo_asset_id !== null && updates.logo_asset_id !== '') {
      const asset = await db.prepare(`
        SELECT id
        FROM media_assets
        WHERE id = ? AND organization_id = ? AND site_id = ? AND status = 'active' AND kind = 'image'
        LIMIT 1
      `).bind(updates.logo_asset_id, organizationId, siteId).first()

      if (!asset) {
        return {
          status: 400,
          data: { error: 'Logo asset not found, unauthorized, or not an image' },
        }
      }
    }
    setParts.push('logo_asset_id = ?')
    params.push(updates.logo_asset_id || null)
  }
  if (updates.logo_url !== undefined) {
    setParts.push('logo_url = ?')
    params.push(updates.logo_url ?? null)
  }
  if (updates.contact_email !== undefined) {
    if (updates.contact_email !== null && updates.contact_email !== '') {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailPattern.test(String(updates.contact_email).trim())) {
        return {
          status: 400,
          data: { error: 'Invalid email address for contact email' },
        }
      }
    }
    setParts.push('contact_email = ?')
    params.push(updates.contact_email ? String(updates.contact_email).trim().toLowerCase() : null)
  }
  if (updates.default_currency !== undefined) {
    if (typeof updates.default_currency !== 'string') {
      return {
        status: 400,
        data: { error: 'Invalid default currency' },
      }
    }
    const currency = updates.default_currency.toUpperCase().trim()
    if (!isCurrencyCode(currency)) {
      return {
        status: 400,
        data: { error: 'Invalid default currency' },
      }
    }
    setParts.push('default_currency = ?')
    params.push(currency)
  }
  if (updates.primary_location_id !== undefined) {
    if (updates.primary_location_id !== null && updates.primary_location_id !== '') {
      const location = await db.prepare(`
        SELECT id
        FROM business_locations
        WHERE id = ? AND organization_id = ? AND site_id = ? AND status = 'active'
        LIMIT 1
      `).bind(updates.primary_location_id, organizationId, siteId).first()

      if (!location) {
        return {
          status: 400,
          data: { error: 'Primary location not found' },
        }
      }
    }
    setParts.push('primary_location_id = ?')
    params.push(updates.primary_location_id || null)
  }
  if (updates.url_structure !== undefined) {
    if (!['location_subdirectories', 'brand_pages'].includes(updates.url_structure)) {
      return {
        status: 400,
        data: { error: 'Invalid URL structure' },
      }
    }

    let settings: Record<string, unknown> = {}
    if (site.settings) {
      try {
        settings = JSON.parse(String(site.settings))
      } catch {
        settings = {}
      }
    }
    settings.url_structure = updates.url_structure
    setParts.push('settings = ?')
    params.push(JSON.stringify(settings))
  }
  if (updates.last_published_at !== undefined) {
    setParts.push('last_published_at = ?')
    params.push(updates.last_published_at ?? null)
  }

  if (setParts.length === 0) {
    const settings = await loadSettingsPayload(db, organizationId, siteId)
    return {
      status: 200,
      data: {
        success: true,
        settings,
        message: 'Site settings updated successfully',
      },
    }
  }

  const now = new Date().toISOString()
  setParts.push('updated_at = ?', 'updated_by = ?')
  params.push(now, userId)

  const result = await db.prepare(`
    UPDATE sites
    SET ${setParts.join(', ')}
    WHERE id = ? AND organization_id = ?
  `).bind(...params, siteId, organizationId).run()

  if (!result.success) {
    throw new Error('Failed to update site settings')
  }

  if (updates.brand_name !== undefined && subdomain && subdomain !== site.subdomain) {
    try {
      if (options.forceSubdomainRegistrationFailure) {
        throw new Error('Forced subdomain registration failure for E2E')
      }
      await createSystemSubdomain(env, db, siteId, organizationId, subdomain)
    } catch (subdomainErr) {
      try {
        await db.prepare(`
          UPDATE sites
          SET brand_name = ?, subdomain = ?, updated_at = ?, updated_by = ?
          WHERE id = ? AND organization_id = ?
        `).bind(site.brand_name, site.subdomain, now, userId, siteId, organizationId).run()
        console.error('updateSiteSettingsFields: createSystemSubdomain failed, rolled back', {
          siteId,
          subdomain,
          err: subdomainErr,
        })
        return {
          status: 400,
          data: { error: 'Failed to register subdomain with Cloudflare. The rename was not applied.' },
        }
      } catch (rollbackErr) {
        console.error('updateSiteSettingsFields: createSystemSubdomain failed AND rollback failed', {
          siteId,
          subdomain,
          subdomainErr,
          rollbackErr,
        })
        return {
          status: 400,
          data: { error: 'Rename was applied but subdomain registration with Cloudflare failed. Please contact support.' },
        }
      }
    }
  }

  const settings = await loadSettingsPayload(db, organizationId, siteId)
  return {
    status: 200,
    data: {
      success: true,
      settings,
      message: 'Site settings updated successfully',
    },
  }
}

export async function updateSiteSettingsFields(
  db: D1Database,
  env: SetupEnv,
  siteId: string,
  organizationId: string,
  updates: UpdateSiteSettingsRequest,
  userId: string,
  options: SiteSettingsUpdateOptions = {}
): Promise<SiteSettingsUpdateResult> {
  if (Object.keys(updates).length === 0) {
    return {
      status: 400,
      data: { error: 'No update fields provided' },
    }
  }

  const site = await db.prepare(`
    SELECT id, organization_id, subdomain, brand_name, settings
    FROM sites
    WHERE id = ? AND organization_id = ?
    LIMIT 1
  `).bind(siteId, organizationId).first<SiteSettingsRow>()

  if (!site) {
    return {
      status: 404,
      data: { error: 'Site not found or access denied' },
    }
  }

  const configError = await updateNonSiteConfigFields(db, organizationId, siteId, updates)
  if (configError) return configError

  if (updates.brand_name !== undefined) {
    const baseSlug = buildSlug(updates.brand_name)
    if (!baseSlug) {
      return {
        status: 400,
        data: { error: 'Brand name must contain at least one alphanumeric character' },
      }
    }

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const subdomain = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`

      const existing = await db.prepare(`
        SELECT id
        FROM sites
        WHERE subdomain = ? AND id != ?
        LIMIT 1
      `).bind(subdomain, siteId).first()
      if (existing) continue

      try {
        return await attemptSiteUpdate(
          db,
          env,
          site,
          siteId,
          organizationId,
          updates,
          userId,
          subdomain,
          options
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/UNIQUE constraint failed/i.test(message)) continue
        throw error
      }
    }

    return {
      status: 409,
      data: { error: `Unable to allocate a unique subdomain after ${MAX_SLUG_ATTEMPTS} attempts` },
    }
  }

  return attemptSiteUpdate(
    db,
    env,
    site,
    siteId,
    organizationId,
    updates,
    userId,
    null,
    options
  )
}
