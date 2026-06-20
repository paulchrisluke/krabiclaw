// PATCH /api/editor/sites/[siteId]/settings
// Update site settings including brand color theme
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { setConfig, type SiteConfig } from '~/server/utils/site-config'
import { resolveColor } from '~/utils/color-utils'
import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) {
    return jsonResponse({ error: 'siteId required' }, { status: 400 })
  }

  const body = await readBody<Record<string, unknown>>(event)
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  // Resolve organization_id from site and verify user permissions
  const site = await db.prepare(
    `SELECT s.organization_id FROM sites s
     JOIN member m ON m.organizationId = s.organization_id
     WHERE s.id = ? AND m.userId = ? AND m.role IN ('owner','admin') AND s.status = 'active' LIMIT 1`
  ).bind(siteId, session.user.id).first<{ organization_id: string }>()

  if (!site) {
    return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
  }

  const organizationId = site.organization_id

  // Process brand_color if provided - resolve natural language to hex
  let brandColor: string | undefined
  if (body.brand_color && typeof body.brand_color === 'string') {
    try {
      const resolvedBrandColor = resolveColor(body.brand_color)
      if (resolvedBrandColor === null || resolvedBrandColor === undefined) {
        return jsonResponse({ error: 'Invalid color value' }, { status: 400 })
      }
      brandColor = resolvedBrandColor
    } catch {
      return jsonResponse({ error: 'Invalid color value' }, { status: 400 })
    }
  }

  // Update each provided config key
  const configKeys: Array<keyof SiteConfig> = [
    'brand_color',
    'social_facebook',
    'social_instagram',
    'social_tiktok',
    'footer_tagline',
    'press_email',
    'partnerships_email',
    'catering_email',
    'careers_email',
    'google_analytics_measurement_id',
    'google_site_verification',
    'default_timezone',
  ]

  if (
    body.default_timezone !== undefined &&
    body.default_timezone !== null &&
    typeof body.default_timezone === 'string' &&
    !Intl.supportedValuesOf('timeZone').includes(body.default_timezone)
  ) {
    return jsonResponse({ error: 'default_timezone must be a valid IANA time zone identifier' }, { status: 400 })
  }

  const updates: Array<Promise<void>> = []

  for (const key of configKeys) {
    const value = body[key]
    if (value !== undefined && value !== null && typeof value === 'string') {
      // Use resolved brand_color, otherwise use original value
      const finalValue = key === 'brand_color' ? brandColor : value
      if (finalValue !== null && finalValue !== undefined) {
        updates.push(setConfig(db, organizationId, siteId, key, finalValue))
      }
    }
  }

  await Promise.all(updates)

  return jsonResponse({
    success: true,
    updated: true,
    brand_color: brandColor
  })
})
