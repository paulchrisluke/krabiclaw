import { resolvePublicTemplate } from '~/utils/template-registry'
import { deleteConfig, getConfig, setConfig } from '~/server/utils/organization-config'
import { createSystemSubdomain, isSystemSubdomainSpent } from '~/server/utils/domains'
import { reconcileZarazAnalytics } from '~/server/utils/zaraz-analytics'
import { isCurrencyCode } from '~/shared/currencies'
import { isOrganizationFontPreset, resolveOrganizationFontPreset } from '~/shared/organization-fonts'
import { purgePublicResourceCacheNow } from '~/server/utils/public-resource-cache'
import type { UpdateOrganizationSettingsRequest } from '~/server/types/organization'
import type { OrganizationIntegrations } from '~/shared/organization-settings'
import { execute, executeBatch, queryAll, queryFirst, type DbClient } from '~/server/db'
import { defaultModuleFeaturesForVertical, parseCmsFeatureOverrideDelta, toggleableModulesForScope, type CmsCapabilityOverrideDelta, type ProductFeature } from '~/config/cms-registry'
import { resolveOrganizationCmsCapabilities } from '~/server/utils/cms-capabilities'
import { checkModuleHasLiveData } from '~/server/utils/module-content-guard'
import type { OrganizationVertical } from '~/utils/vertical-copy'
import { buildSingleMediaPlacementQueries, hydrateMediaAssetRefs } from '~/server/utils/media-asset-manager'
import { refreshSocialCard } from '~/server/utils/social-card'
import { organizationAdapter } from '~/server/utils/member-access'
import type { CloudflareEnv } from '~/server/utils/auth'

type SetupEnv = Parameters<typeof createSystemSubdomain>[0]

const MAX_SLUG_ATTEMPTS = 10

export class OrganizationSettingsNotFoundError extends Error {
  constructor() {
    super('Organization not found')
    this.name = 'OrganizationSettingsNotFoundError'
  }
}

interface OrganizationSettingsRow {
  id: string
  status: string
  subdomain: string | null
  name: string | null
  vertical: string
  theme_id: string
}

interface FullOrganizationRow extends OrganizationSettingsRow {
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
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  social_facebook_url: string | null
  social_instagram_url: string | null
  social_tiktok_url: string | null
  feature_overrides: string | null
  created_at: string
  updated_at: string
}

export interface OrganizationSettingsUpdateResult {
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
) {
  const updatedOrganization = await queryFirst<FullOrganizationRow & { vertical: string; theme_id: string; integrations_json: string; locations_json: string }>(db, `
    SELECT organization.id, subdomain, organization.status,
           (SELECT 'https://' || domain FROM organization_domains WHERE organization_id = organization.id AND role = 'canonical' AND status = 'active') AS public_url, COALESCE((SELECT status FROM organization_domains WHERE organization_id = organization.id AND type = 'custom' AND status NOT IN ('deleted', 'disabled') ORDER BY role = 'canonical' DESC, created_at, id LIMIT 1), 'none') AS custom_domain_status, default_currency,
           name, brand_description,
           mp.asset_id AS logo_media_id, ma.public_url AS logo_public_url,
           ma.thumbnail_url AS logo_thumbnail_url, ma.kind AS logo_kind,
           fmp.asset_id AS favicon_media_id, fma.public_url AS favicon_public_url,
           fma.thumbnail_url AS favicon_thumbnail_url, fma.kind AS favicon_kind,
           smp.asset_id AS social_share_media_id, sma.public_url AS social_share_public_url,
           sma.thumbnail_url AS social_share_thumbnail_url, sma.kind AS social_share_kind,
           contact_email,
           seo_title, seo_description, canonical_url,
           social_facebook_url, social_instagram_url, social_tiktok_url,
           feature_overrides, organization."createdAt" AS created_at, organization.updated_at,
           vertical, theme_id, integrations_json,
           (SELECT json_group_array(json_object('id', id, 'slug', slug, 'title', title,
                     'google_place_id', google_place_id, 'rating', rating, 'review_count', review_count,
                     'last_synced_at', last_synced_at))
              FROM (SELECT * FROM business_locations
                     WHERE organization_id = organization.id AND status = 'active' ORDER BY title, id)) AS locations_json
    FROM organization
    LEFT JOIN media_placements mp ON mp.organization_id = organization.id AND mp.owner_type = 'organization'
      AND mp.owner_id = organization.id AND mp.slot = 'logo' AND mp.sort_order = 0 AND mp.status = 'active'
    LEFT JOIN media_assets ma ON ma.id = mp.asset_id AND ma.status = 'active'
    LEFT JOIN media_placements fmp ON fmp.organization_id = organization.id AND fmp.owner_type = 'organization'
      AND fmp.owner_id = organization.id AND fmp.slot = 'favicon' AND fmp.sort_order = 0 AND fmp.status = 'active'
    LEFT JOIN media_assets fma ON fma.id = fmp.asset_id AND fma.status = 'active'
    LEFT JOIN media_placements smp ON smp.organization_id = organization.id AND smp.owner_type = 'organization'
      AND smp.owner_id = organization.id AND smp.slot = 'social_share' AND smp.sort_order = 0 AND smp.status = 'active'
    LEFT JOIN media_assets sma ON sma.id = smp.asset_id AND sma.status = 'active'
    WHERE organization.id = ?
    LIMIT 1
  `, [organizationId])

  if (!updatedOrganization) {
    throw new OrganizationSettingsNotFoundError()
  }

  const siteConfig = await getConfig(db, organizationId)

  // An empty toggle list is what a tenant with no modules looks like, so serving
  // one on an unsupported vertical/template pair showed them a settings page that
  // said their features were off rather than that we could not resolve them.
  const { template, capabilities } = resolveOrganizationCmsCapabilities(updatedOrganization.vertical, updatedOrganization.theme_id, {
    organizationEnabledFeatures: updatedOrganization.feature_overrides,
  })
  const toggleableFeatures: readonly ProductFeature[] = toggleableModulesForScope(template, 'organization')
  const effectiveFeatures: readonly ProductFeature[] = [...new Set([...capabilities.pages.map(p => p.feature), ...capabilities.managers.map(m => m.id)])]
  const defaultFeatures: readonly ProductFeature[] = defaultModuleFeaturesForVertical(updatedOrganization.vertical as OrganizationVertical)

  return {
    id: updatedOrganization.id,
    subdomain: updatedOrganization.subdomain,
    theme: resolvePublicTemplate({ themeId: updatedOrganization.theme_id }).slug,
    status: updatedOrganization.status,

    public_url: updatedOrganization.public_url,
    custom_domain_status: updatedOrganization.custom_domain_status,
    name: updatedOrganization.name,
    brand_description: updatedOrganization.brand_description,
    media: [
      ...(updatedOrganization.logo_media_id ? [{
        asset_id: updatedOrganization.logo_media_id,
        slot: 'logo',
        public_url: updatedOrganization.logo_public_url,
        thumbnail_url: updatedOrganization.logo_thumbnail_url,
        kind: updatedOrganization.logo_kind,
      }] : []),
      ...(updatedOrganization.favicon_media_id ? [{
        asset_id: updatedOrganization.favicon_media_id,
        slot: 'favicon',
        public_url: updatedOrganization.favicon_public_url,
        thumbnail_url: updatedOrganization.favicon_thumbnail_url,
        kind: updatedOrganization.favicon_kind,
      }] : []),
      ...(updatedOrganization.social_share_media_id ? [{
        asset_id: updatedOrganization.social_share_media_id,
        slot: 'social_share',
        public_url: updatedOrganization.social_share_public_url,
        thumbnail_url: updatedOrganization.social_share_thumbnail_url,
        kind: updatedOrganization.social_share_kind,
      }] : []),
    ],
    contact_email: updatedOrganization.contact_email,
    seo_title: updatedOrganization.seo_title,
    seo_description: updatedOrganization.seo_description,
    canonical_url: updatedOrganization.canonical_url,
    social_facebook_url: updatedOrganization.social_facebook_url,
    social_instagram_url: updatedOrganization.social_instagram_url,
    social_tiktok_url: updatedOrganization.social_tiktok_url,
    feature_overrides: parseCmsFeatureOverrideDelta(updatedOrganization.feature_overrides),
    toggleable_features: toggleableFeatures,
    effective_features: effectiveFeatures,
    default_features: defaultFeatures,
    brand_color: siteConfig.brand_color || '',
    font_preset: resolveOrganizationFontPreset(siteConfig.font_preset),
    default_currency: updatedOrganization.default_currency,
    press_email: siteConfig.press_email || '',
    partnerships_email: siteConfig.partnerships_email || '',
    catering_email: siteConfig.catering_email || '',
    careers_email: siteConfig.careers_email || '',
    google_analytics_measurement_id: siteConfig.google_analytics_measurement_id || '',
    integrations: integrationsSummary(JSON.parse(updatedOrganization.integrations_json) as OrganizationIntegrations, JSON.parse(updatedOrganization.locations_json) as IntegrationLocation[]),
    created_at: updatedOrganization.created_at,
    updated_at: updatedOrganization.updated_at,
  }
}

interface IntegrationLocation {
  id: string
  slug: string
  title: string
  google_place_id: string | null
  rating: number | null
  review_count: number | null
  last_synced_at: string | null
}

/**
 * What each integration is connected to, for the Integrations list and its
 * leaves — names and statuses, never a token. Google Maps is per location, so
 * its answer is the locations and which of them name a place.
 */
function integrationsSummary(integrations: OrganizationIntegrations, locations: IntegrationLocation[]) {
  return {
    google_maps: locations,
    google_analytics: integrations.google_analytics
      ? { property_name: integrations.google_analytics.property_name ?? null, measurement_id: integrations.google_analytics.measurement_id, status: integrations.google_analytics.status }
      : null,
    google_search_console: integrations.google_search_console
      ? { site_url: integrations.google_search_console.site_url, status: integrations.google_search_console.status }
      : null,
    google_account: integrations.google_credential?.provider_account_email ?? null,
    facebook: integrations.facebook
      ? { page_name: integrations.facebook.page_name, status: integrations.facebook.status }
      : null,
    instagram: integrations.instagram
      ? { username: integrations.instagram.username, status: integrations.instagram.status }
      : null,
  }
}

async function updateNonOrganizationConfigFields(
  db: D1Database,
  organizationId: string,
  updates: UpdateOrganizationSettingsRequest
): Promise<OrganizationSettingsUpdateResult | null> {
  if (updates.brand_color !== undefined) {
    if (updates.brand_color) {
      await setConfig(db, organizationId, 'brand_color', updates.brand_color)
    } else {
      await deleteConfig(db, organizationId, 'brand_color')
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

  for (const key of ['press_email', 'partnerships_email', 'catering_email', 'careers_email'] as const) {
    if (updates[key] !== undefined) {
      const value = updates[key]
      if (value) {
        await setConfig(db, organizationId, key, value)
      } else {
        await deleteConfig(db, organizationId, key)
      }
    }
  }

  return null
}

async function attemptOrganizationUpdate(
  db: D1Database,
  env: SetupEnv,
  organization: OrganizationSettingsRow,
  organizationId: string,
  updates: UpdateOrganizationSettingsRequest,
  userId: string,
  subdomain: string | null
): Promise<OrganizationSettingsUpdateResult> {
  const setParts: string[] = []
  const params: Array<string | null> = []
  // Extra WHERE terms the UPDATE must still satisfy at the moment it runs.
  const guards: string[] = []
  const organizationMedia = updates.media

  if (updates.font_preset !== undefined) {
    setParts.push("settings_json = json_set(settings_json, '$.config.font_preset', ?)")
    params.push(updates.font_preset)
  }
  if (updates.name !== undefined) {
    setParts.push('name = ?', 'subdomain = ?')
    params.push(updates.name, subdomain)
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
  if (updates.status !== undefined) {
    // Draft and Live are the tenant's to move between. 'suspended' is the
    // platform's hold, so the tenant neither sets it nor clears it. The read
    // answers plainly; the guard on the UPDATE is what a suspension landing
    // between the two cannot outrun.
    if (updates.status !== 'active' && updates.status !== 'inactive') {
      return { status: 400, data: { error: 'Website status must be active or inactive' } }
    }
    if (organization.status === 'suspended') {
      return { status: 409, data: { error: 'This website is suspended. Contact support to restore it.' } }
    }
    setParts.push('status = ?')
    params.push(updates.status)
    guards.push("status <> 'suspended'")
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
    let newEffectiveFeatures: readonly ProductFeature[]
    try {
      const { template, capabilities } = resolveOrganizationCmsCapabilities(organization.vertical, organization.theme_id, {
        organizationEnabledFeatures: newDelta ? JSON.stringify(newDelta) : null,
      })
      allowedModules = toggleableModulesForScope(template, 'organization')
      newEffectiveFeatures = [...new Set([...capabilities.pages.map(p => p.feature), ...capabilities.managers.map(m => m.id)])]
    } catch {
      return { status: 422, data: { error: 'Unsupported organization vertical/template — cannot resolve feature catalog' } }
    }

    if (newDelta) {
      const submitted = [...(newDelta.enabled ?? []), ...(newDelta.disabled ?? [])]
      const invalid = submitted.filter(feature => !allowedModules.includes(feature as ProductFeature))
      if (invalid.length > 0) {
        return { status: 400, data: { error: `Unsupported module(s) for this organization's template: ${invalid.join(', ')}` } }
      }

      // Disabling a module that still has live content/bookings must not silently hide it.
      for (const feature of newDelta.disabled ?? []) {
        const guard = await checkModuleHasLiveData(db, { organizationId }, feature as ProductFeature)
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
       WHERE organization_id = ? AND status = 'active' AND feature_overrides IS NOT NULL
    `, [ organizationId])
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

  if (setParts.length === 0 && organizationMedia === undefined) {
    const settings = await loadSettingsPayload(db, organizationId)
    return {
      status: 200,
      data: {
        success: true,
        settings,
        message: 'Organization settings updated successfully',
      },
    }
  }

  const now = new Date().toISOString()
  if (setParts.length > 0) {
    setParts.push('updated_at = ?', 'updated_by = ?')
    params.push(now, userId)
  }

  const organizationUpdate = {
    sql: `
    UPDATE organization
    SET ${setParts.join(', ')}
    WHERE id = ?${guards.map(guard => ` AND ${guard}`).join('')}
  `,
    values: [...params, organizationId],
  }

  // A guard that matched nothing means the row no longer answers to this
  // write — a suspended tenant being told to go Live. Reporting success would
  // leave the owner believing they published it.
  if (guards.length > 0 && setParts.length > 0) {
    const guarded = await queryFirst<{ status: string }>(db,
      'SELECT status FROM organization WHERE id = ? LIMIT 1', [organizationId])
    if (guarded?.status === 'suspended') {
      return { status: 409, data: { error: 'This website is suspended. Contact support to restore it.' } }
    }
  }

  const isRename = updates.name !== undefined && subdomain && subdomain !== organization.subdomain
  if (isRename && setParts.length > 0) {
    await createSystemSubdomain(env, db, organizationId, subdomain, { organizationUpdate })
  } else if (setParts.length > 0) {
    const result = await execute(db, organizationUpdate.sql, organizationUpdate.values)
    if (!result.success) {
      throw new Error('Failed to update organization settings')
    }
  }

  // All settings callers use this mutation path; refresh both public resource
  // and HTML caches when typography changes, including a reset to Default.
  if (updates.font_preset !== undefined) await purgePublicResourceCacheNow(env, organizationId)

  // Zaraz serves analytics only for tenants that are Live, so taking one to
  // Draft has to withdraw its tag rather than leave it collecting from a
  // website the owner believes is unpublished.
  if (updates.status !== undefined) await reconcileZarazAnalytics(env, db)

  if (organizationMedia !== undefined && organizationMedia.length > 0) {
    const targetSlots = new Set(organizationMedia.map(item => item.slot))
    const queries = [...targetSlots].flatMap(slot => buildSingleMediaPlacementQueries({
      organizationId,
      
      placement: { owner_type: 'organization', owner_id: organizationId, slot },
      media: organizationMedia.filter(item => item.slot === slot && item.asset_id).map(item => ({ asset_id: String(item.asset_id) })),
      now,
    }))
    await executeBatch(db, queries)
  }

  const cardInputChanged = updates.name !== undefined
    || updates.brand_description !== undefined
    || updates.seo_title !== undefined
    || updates.seo_description !== undefined
    || organizationMedia?.some(item => item.slot === 'logo' || item.slot === 'social_share') === true
  if (cardInputChanged) {
    await refreshSocialCard({ db, env, owner: { owner_type: 'organization', owner_id: organizationId }, actorId: userId })
  }

  const settings = await loadSettingsPayload(db, organizationId)
  return {
    status: 200,
    data: {
      success: true,
      settings,
      message: 'Organization settings updated successfully',
    },
  }
}

export async function updateOrganizationSettingsFields(
  db: D1Database,
  env: SetupEnv & CloudflareEnv,
  organizationId: string,
  updates: UpdateOrganizationSettingsRequest,
  userId: string
): Promise<OrganizationSettingsUpdateResult> {
  if (Object.keys(updates).length === 0) {
    return {
      status: 400,
      data: { error: 'No update fields provided' },
    }
  }

  const organization = await queryFirst<OrganizationSettingsRow>(db, `
    SELECT id, status, subdomain, name, vertical, theme_id
    FROM organization
    WHERE id = ?
    LIMIT 1
  `, [organizationId])

  if (!organization) {
    return {
      status: 404,
      data: { error: 'Organization not found or access denied' },
    }
  }

  // Validate before any settings writes. Preset IDs are not CSS or font URLs.
  if (updates.font_preset !== undefined) {
    if (!isOrganizationFontPreset(updates.font_preset)) {
      return { status: 400, data: { error: 'font_preset must be default or mali' } }
    }
    if (updates.font_preset === 'mali' && resolvePublicTemplate({ themeId: organization.theme_id }).slug !== 'saya') {
      return { status: 400, data: { error: 'Mali is available for the Saya template only' } }
    }
  }

  const organizationMedia = updates.media
  if (organizationMedia !== undefined) {
    if (!Array.isArray(organizationMedia) || organizationMedia.some(item => !item || !['logo', 'favicon', 'social_share'].includes(item.slot) || (item.asset_id !== null && typeof item.asset_id !== 'string'))) {
      return { status: 400, data: { error: 'media must contain an asset_id and a logo, favicon, or social_share slot' } }
    }
    try {
      await hydrateMediaAssetRefs(db, {
        organizationId,
        
        refs: organizationMedia.filter(item => item.asset_id).map(item => ({ asset_id: String(item.asset_id) })),
        allowedKinds: ['image'],
      })
    } catch {
      return { status: 400, data: { error: 'Invalid media references' } }
    }
  }

  const configError = await updateNonOrganizationConfigFields(db, organizationId, updates)
  if (configError) return configError
  if (updates.name !== undefined) {
    const baseSlug = buildSlug(updates.name)
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
        FROM organization
        WHERE subdomain = ? AND id != ?
        LIMIT 1
      `, [subdomain, organizationId])
      if (existing) continue
      if (await isSystemSubdomainSpent(env, db, subdomain)) continue

      let result: OrganizationSettingsUpdateResult
      try {
        result = await attemptOrganizationUpdate(
          db,
          env,
          organization,
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
      // One business, one name. The organization Better Auth holds is that
      // business, so it takes the brand name a guest sees rather than keeping
      // a second name of its own. Outside the retry: a failure here is not a
      // subdomain collision and must not spend another attempt.
      if (result.status === 200) {
        const adapter = await organizationAdapter(env)
        await adapter.updateOrganization(organizationId, { name: updates.name.trim() })
      }
      return result
    }

    return {
      status: 409,
      data: { error: `Unable to allocate a unique subdomain after ${MAX_SLUG_ATTEMPTS} attempts` },
    }
  }

  return attemptOrganizationUpdate(
    db,
    env,
    organization,
    organizationId,
    updates,
    userId,
    null
  )
}
