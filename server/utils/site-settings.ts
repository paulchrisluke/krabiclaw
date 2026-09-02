import { deleteConfig, getConfig, setConfig } from '~/server/utils/site-config'
import { createSystemSubdomain, isSystemSubdomainSpent } from '~/server/utils/domains'
import { reconcileZarazAnalytics } from '~/server/utils/zaraz-analytics'
import { isCurrencyCode } from '~/shared/currencies'
import type { UpdateSiteSettingsRequest } from '~/server/types/site'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { defaultModuleFeaturesForVertical, parseCmsFeatureOverrideDelta, toggleableModulesForScope, type CmsCapabilityOverrideDelta, type ProductFeature } from '~/config/cms-registry'
import { resolveSiteCmsCapabilities } from '~/server/utils/cms-capabilities'
import { checkModuleHasLiveData } from '~/server/utils/module-content-guard'
import type { SiteVertical } from '~/utils/vertical-copy'
import { buildSingleMediaPlacementQueries, hydrateMediaAssetRefs } from '~/server/utils/media-asset-manager'
import { refreshSocialCard } from '~/server/utils/social-card'

type SetupEnv = Parameters<typeof createSystemSubdomain>[0]

const MAX_SLUG_ATTEMPTS = 10

export class SiteSettingsNotFoundError extends Error {
  constructor() {
    super('Site not found')
    this.name = 'SiteSettingsNotFoundError'
  }
}

interface SiteSettingsRow {
  id: string
  organization_id: string
  subdomain: string | null
  brand_name: string | null
  vertical: string
  theme_id: string
}

interface FullSiteRow extends SiteSettingsRow {
  theme: string | null
  status: string
  primary_location_id: string | null
  public_url: string | null
  custom_domain_status: string | null
  default_currency: string | null
  brand_description: string | null
  logo_media_id: string | null
  logo_public_url: string | null
  logo_thumbnail_url: string | null
  logo_kind: 'image' | 'video' | null
  favicon_media_id: string | null
  favicon_public_url: string | null
  favicon_thumbnail_url: string | null
  favicon_kind: 'image' | 'video' | null
  social_share_media_id: string | null
  social_share_public_url: string | null
  social_share_thumbnail_url: string | null
  social_share_kind: 'image' | 'video' | null
  contact_email: string | null
  last_published_at: string | null
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  robots: string | null
  social_facebook_url: string | null
  social_instagram_url: string | null
  social_tiktok_url: string | null
  feature_overrides: string | null
  created_at: string
  updated_at: string
}

export interface SiteSettingsUpdateResult {
  status: number
  data: Record<string, unknown>
}


function buildSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 30)
}

export async function loadSettingsPayload(
  db: DbClient,
  organizationId: string,
  siteId: string
) {
  const updatedSite = await queryFirst<FullSiteRow & { vertical: string; theme_id: string }>(db, `
    SELECT sites.id, sites.organization_id, subdomain, theme, sites.status,
           primary_location_id, sites.public_url, custom_domain_status, default_currency,
           brand_name, brand_description,
           mp.asset_id AS logo_media_id, ma.public_url AS logo_public_url,
           ma.thumbnail_url AS logo_thumbnail_url, ma.kind AS logo_kind,
           fmp.asset_id AS favicon_media_id, fma.public_url AS favicon_public_url,
           fma.thumbnail_url AS favicon_thumbnail_url, fma.kind AS favicon_kind,
           smp.asset_id AS social_share_media_id, sma.public_url AS social_share_public_url,
           sma.thumbnail_url AS social_share_thumbnail_url, sma.kind AS social_share_kind,
           contact_email,
           seo_title, seo_description, canonical_url, robots,
           social_facebook_url, social_instagram_url, social_tiktok_url,
           feature_overrides, last_published_at, sites.created_at, sites.updated_at,
           vertical, theme_id
    FROM sites
    LEFT JOIN media_placements mp ON mp.site_id = sites.id AND mp.owner_type = 'site'
      AND mp.owner_id = sites.id AND mp.slot = 'logo' AND mp.sort_order = 0 AND mp.status = 'active'
    LEFT JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
    LEFT JOIN media_placements fmp ON fmp.site_id = sites.id AND fmp.owner_type = 'site'
      AND fmp.owner_id = sites.id AND fmp.slot = 'favicon' AND fmp.sort_order = 0 AND fmp.status = 'active'
    LEFT JOIN media_assets fma ON fma.id = fmp.asset_id AND fma.status = 'active'
    LEFT JOIN media_placements smp ON smp.site_id = sites.id AND smp.owner_type = 'site'
      AND smp.owner_id = sites.id AND smp.slot = 'social_share' AND smp.sort_order = 0 AND smp.status = 'active'
    LEFT JOIN media_assets sma ON sma.id = smp.asset_id AND sma.status = 'active'
    WHERE sites.id = ? AND sites.organization_id = ?
    LIMIT 1
  `, [siteId, organizationId])

  if (!updatedSite) {
    throw new SiteSettingsNotFoundError()
  }

  const siteConfig = await getConfig(db, organizationId, siteId)

  let toggleableFeatures: readonly ProductFeature[] = []
  let effectiveFeatures: readonly ProductFeature[] = []
  let defaultFeatures: readonly ProductFeature[] = []
  try {
    const { template, capabilities } = resolveSiteCmsCapabilities(updatedSite.vertical, updatedSite.theme_id, {
      siteEnabledFeatures: updatedSite.feature_overrides,
    })
    toggleableFeatures = toggleableModulesForScope(template, 'site')
    effectiveFeatures = [...new Set([...capabilities.pages.map(p => p.feature), ...capabilities.managers.map(m => m.id)])]
    defaultFeatures = defaultModuleFeaturesForVertical(updatedSite.vertical as SiteVertical)
  } catch {
    // Unsupported vertical/template combination — leave the feature toggle list empty rather
    // than 500ing the whole settings payload over an unrelated field.
  }

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
    media: [
      ...(updatedSite.logo_media_id ? [{
        asset_id: updatedSite.logo_media_id,
        slot: 'logo',
        public_url: updatedSite.logo_public_url,
        thumbnail_url: updatedSite.logo_thumbnail_url,
        kind: updatedSite.logo_kind,
      }] : []),
      ...(updatedSite.favicon_media_id ? [{
        asset_id: updatedSite.favicon_media_id,
        slot: 'favicon',
        public_url: updatedSite.favicon_public_url,
        thumbnail_url: updatedSite.favicon_thumbnail_url,
        kind: updatedSite.favicon_kind,
      }] : []),
      ...(updatedSite.social_share_media_id ? [{
        asset_id: updatedSite.social_share_media_id,
        slot: 'social_share',
        public_url: updatedSite.social_share_public_url,
        thumbnail_url: updatedSite.social_share_thumbnail_url,
        kind: updatedSite.social_share_kind,
      }] : []),
    ],
    contact_email: updatedSite.contact_email,
    seo_title: updatedSite.seo_title,
    seo_description: updatedSite.seo_description,
    canonical_url: updatedSite.canonical_url,
    robots: updatedSite.robots,
    social_facebook_url: updatedSite.social_facebook_url,
    social_instagram_url: updatedSite.social_instagram_url,
    social_tiktok_url: updatedSite.social_tiktok_url,
    feature_overrides: parseCmsFeatureOverrideDelta(updatedSite.feature_overrides),
    toggleable_features: toggleableFeatures,
    effective_features: effectiveFeatures,
    default_features: defaultFeatures,
    brand_color: siteConfig.brand_color || '',
    default_currency: updatedSite.default_currency || 'USD',
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

  for (const key of ['press_email', 'partnerships_email', 'catering_email', 'careers_email', 'google_analytics_measurement_id', 'google_site_verification'] as const) {
    if (updates[key] !== undefined) {
      const value = updates[key]
      if (value) {
        await setConfig(db, organizationId, siteId, key, value)
      } else {
        await deleteConfig(db, organizationId, siteId, key)
      }
    }
  }

  return null
}

async function syncAnalyticsSettingToZaraz(
  db: D1Database,
  env: SetupEnv,
  siteId: string,
  measurementId: unknown
) {
  if (measurementId === undefined) return

  try {
    await reconcileZarazAnalytics(env, db)
  } catch (error) {
    console.error('zaraz_reconciliation_failed', { siteId, error })
  }
}

async function attemptSiteUpdate(
  db: D1Database,
  env: SetupEnv,
  site: SiteSettingsRow,
  siteId: string,
  organizationId: string,
  updates: UpdateSiteSettingsRequest,
  userId: string,
  subdomain: string | null
): Promise<SiteSettingsUpdateResult> {
  const setParts: string[] = []
  const params: Array<string | null> = []
  const siteMedia = updates.media

  if (updates.brand_name !== undefined) {
    setParts.push('brand_name = ?', 'subdomain = ?')
    params.push(updates.brand_name, subdomain)
  }
  if (updates.brand_description !== undefined) {
    setParts.push('brand_description = ?')
    params.push(updates.brand_description ?? null)
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
      const location = await queryFirst(db, `
        SELECT id
        FROM business_locations
        WHERE id = ? AND organization_id = ? AND site_id = ? AND status = 'active'
        LIMIT 1
      `, [updates.primary_location_id, organizationId, siteId])

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
  if (updates.last_published_at !== undefined) {
    setParts.push('last_published_at = ?')
    params.push(updates.last_published_at ?? null)
  }
  if (updates.seo_title !== undefined) {
    setParts.push('seo_title = ?')
    params.push(updates.seo_title ?? null)
  }
  if (updates.seo_description !== undefined) {
    setParts.push('seo_description = ?')
    params.push(updates.seo_description ?? null)
  }
  if (updates.canonical_url !== undefined) {
    setParts.push('canonical_url = ?')
    params.push(updates.canonical_url ?? null)
  }
  if (updates.robots !== undefined) {
    setParts.push('robots = ?')
    params.push(updates.robots ?? null)
  }
  for (const key of ['social_facebook_url', 'social_instagram_url', 'social_tiktok_url'] as const) {
    if (updates[key] === undefined) continue
    const trimmed = updates[key]?.trim() || null
    if (trimmed) {
      try {
        const url = new URL(trimmed)
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol')
      } catch {
        return { status: 400, data: { error: `Invalid URL for ${key.replace('social_', '').replace('_url', '')}` } }
      }
    }
    setParts.push(`${key} = ?`)
    params.push(trimmed)
  }
  if (updates.feature_overrides !== undefined) {
    let newDelta: CmsCapabilityOverrideDelta | null = null
    if (updates.feature_overrides !== null) {
      const { enabled = [], disabled = [] } = updates.feature_overrides
      if (!Array.isArray(enabled) || !enabled.every(v => typeof v === 'string') || !Array.isArray(disabled) || !disabled.every(v => typeof v === 'string')) {
        return { status: 400, data: { error: 'feature_overrides.enabled/disabled must be arrays of feature ids' } }
      }
      newDelta = { enabled: enabled as ProductFeature[], disabled: disabled as ProductFeature[] }
    }

    let allowedModules: readonly ProductFeature[] = []
    let newEffectiveFeatures: readonly ProductFeature[] = []
    try {
      const { template, capabilities } = resolveSiteCmsCapabilities(site.vertical, site.theme_id, {
        siteEnabledFeatures: newDelta ? JSON.stringify(newDelta) : null,
      })
      allowedModules = toggleableModulesForScope(template, 'site')
      newEffectiveFeatures = [...new Set([...capabilities.pages.map(p => p.feature), ...capabilities.managers.map(m => m.id)])]
    } catch {
      return { status: 422, data: { error: 'Unsupported site vertical/template — cannot resolve feature catalog' } }
    }

    if (newDelta) {
      const submitted = [...(newDelta.enabled ?? []), ...(newDelta.disabled ?? [])]
      const invalid = submitted.filter(feature => !allowedModules.includes(feature as ProductFeature))
      if (invalid.length > 0) {
        return { status: 400, data: { error: `Unsupported module(s) for this site's template: ${invalid.join(', ')}` } }
      }

      // Disabling a module that still has live content/bookings must not silently hide it.
      for (const feature of newDelta.disabled ?? []) {
        const guard = await checkModuleHasLiveData(db, { siteId }, feature as ProductFeature)
        if (guard.blocked) {
          return { status: 409, data: { error: guard.reason } }
        }
      }
    }

    // A location's feature_overrides.enabled entries must stay a subset of the site's EFFECTIVE
    // set (config/cms-registry.ts) — check every location with an explicit override before
    // writing, whether this update adds/removes a module or clears the override back to vertical
    // defaults, so we never leave a location whose override resolveCmsCapabilities would reject.
    // status = 'active' matches listDashboardLocations' filter — an inactive/soft-deleted
    // location's stale override must not block a legitimate site feature update.
    const overriddenLocations = await queryAll<{ title: string; feature_overrides: string }>(db, `
      SELECT title, feature_overrides FROM business_locations
      WHERE site_id = ? AND organization_id = ? AND status = 'active' AND feature_overrides IS NOT NULL
    `, [siteId, organizationId])
    const newEffectiveSet = new Set(newEffectiveFeatures)
    const brokenLocations = overriddenLocations
      .filter(loc => (parseCmsFeatureOverrideDelta(loc.feature_overrides)?.enabled ?? []).some(feature => !newEffectiveSet.has(feature)))
      .map(loc => loc.title)
    if (brokenLocations.length > 0) {
      return {
        status: 409,
        data: { error: `Cannot update site features: location(s) ${brokenLocations.join(', ')} have overrides that require a feature this update would remove. Update those locations first.` },
      }
    }

    setParts.push('feature_overrides = ?')
    params.push(newDelta ? JSON.stringify(newDelta) : null)
  }

  if (setParts.length === 0 && siteMedia === undefined) {
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
  if (setParts.length > 0) {
    setParts.push('updated_at = ?', 'updated_by = ?')
    params.push(now, userId)
  }

  const siteUpdate = {
    sql: `
    UPDATE sites
    SET ${setParts.join(', ')}
    WHERE id = ? AND organization_id = ?
  `,
    values: [...params, siteId, organizationId],
  }

  const isRename = updates.brand_name !== undefined && subdomain && subdomain !== site.subdomain
  if (isRename && setParts.length > 0) {
    await createSystemSubdomain(env, db, siteId, organizationId, subdomain, { siteUpdate })
  } else if (setParts.length > 0) {
    const result = await execute(db, siteUpdate.sql, siteUpdate.values)
    if (!result.success) {
      throw new Error('Failed to update site settings')
    }
  }

  if (siteMedia !== undefined && siteMedia.length > 0) {
    const targetSlots = new Set(siteMedia.map(item => item.slot))
    const queries = [...targetSlots].flatMap(slot => buildSingleMediaPlacementQueries({
      organizationId,
      siteId,
      placement: { owner_type: 'site', owner_id: siteId, slot },
      media: siteMedia.filter(item => item.slot === slot && item.asset_id).map(item => ({ asset_id: String(item.asset_id) })),
      now,
    }))
    await executeBatch(db, queries)
  }

  const cardInputChanged = updates.brand_name !== undefined
    || updates.brand_description !== undefined
    || updates.seo_title !== undefined
    || updates.seo_description !== undefined
    || siteMedia?.some(item => item.slot === 'logo' || item.slot === 'social_share') === true
  if (cardInputChanged) {
    await refreshSocialCard({ db, env, owner: { owner_type: 'site', owner_id: siteId }, actorId: userId })
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
  userId: string
): Promise<SiteSettingsUpdateResult> {
  if (Object.keys(updates).length === 0) {
    return {
      status: 400,
      data: { error: 'No update fields provided' },
    }
  }

  const site = await queryFirst<SiteSettingsRow>(db, `
    SELECT id, organization_id, subdomain, brand_name, vertical, theme_id
    FROM sites
    WHERE id = ? AND organization_id = ?
    LIMIT 1
  `, [siteId, organizationId])

  if (!site) {
    return {
      status: 404,
      data: { error: 'Site not found or access denied' },
    }
  }

  const siteMedia = updates.media
  if (siteMedia !== undefined) {
    if (!Array.isArray(siteMedia) || siteMedia.some(item => !item || !['logo', 'favicon', 'social_share'].includes(item.slot) || (item.asset_id !== null && typeof item.asset_id !== 'string'))) {
      return { status: 400, data: { error: 'media must contain an asset_id and a logo, favicon, or social_share slot' } }
    }
    try {
      await hydrateMediaAssetRefs(db, {
        organizationId,
        siteId,
        refs: siteMedia.filter(item => item.asset_id).map(item => ({ asset_id: String(item.asset_id) })),
        allowedKinds: ['image'],
      })
    } catch {
      return { status: 400, data: { error: 'Invalid media references' } }
    }
  }

  const configError = await updateNonSiteConfigFields(db, organizationId, siteId, updates)
  if (configError) return configError
  await syncAnalyticsSettingToZaraz(
    db,
    env,
    siteId,
    updates.google_analytics_measurement_id,
  )

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

      const existing = await queryFirst(db, `
        SELECT id
        FROM sites
        WHERE subdomain = ? AND id != ?
        LIMIT 1
      `, [subdomain, siteId])
      if (existing) continue
      if (await isSystemSubdomainSpent(env, db, subdomain)) continue

      try {
        return await attemptSiteUpdate(
          db,
          env,
          site,
          siteId,
          organizationId,
          updates,
          userId,
          subdomain
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
    null
  )
}
