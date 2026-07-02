// POST /api/dashboard/onboarding/setup-manual
// Create a site from a business name only — no Google Places data required.
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { runSiteCreation, VALID_VERTICALS } from '~/server/utils/site-creation'
import { updateLocation } from '~/server/utils/location-management'
import { purgeBootstrapCacheSafe } from '~/server/utils/bootstrap-cache'
import { queryFirst } from '~/server/db'

type SiteEnv = Parameters<typeof runSiteCreation>[0]

function slugify(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || `site-${crypto.randomUUID().slice(0, 8)}`
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500 })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })

  const body = await readBody(event) as { name?: unknown; vertical?: unknown; details?: Record<string, unknown> | null }
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return jsonResponse({ error: 'name is required' }, { status: 400 })
  const details = body.details && typeof body.details === 'object' ? body.details : null

  const vertical = typeof body?.vertical === 'string' && VALID_VERTICALS.includes(body.vertical as never)
    ? (body.vertical as 'restaurant' | 'experience')
    : 'restaurant'

  const dashboard = await getDashboardContext(event, { requireSite: false })
  if (dashboard?.site) {
    return jsonResponse({ error: 'You already have a site. Onboarding is for new sites only.' }, { status: 400 })
  }

  const result = await runSiteCreation(env as SiteEnv, db, session.user.id, {
    name,
    subdomain: slugify(name).slice(0, 40),
    vertical,
  })

  if (result.status !== 200) {
    if (result.status === 409) {
      return jsonResponse({ error: 'A workspace with this name already exists. Try a different name.' }, { status: 409 })
    }
    return jsonResponse({ error: (result.data.error as string) || 'Could not create workspace. Please try again.' }, { status: result.status || 500 })
  }

  const organizationId = result.data.organizationId as string
  const siteId = result.data.siteId as string | undefined
  const siteSlug = result.data.subdomain as string | undefined
  const orgRow = await queryFirst<{ slug: string }>(db, `SELECT slug FROM organization WHERE id = ? LIMIT 1`, [organizationId])

  if (!orgRow) {
    return jsonResponse({ error: 'Organization not found after site creation. Data integrity issue.' }, { status: 500 })
  }

  const locationRow = siteId
    ? await queryFirst<{ id: string; slug: string | null }>(db, `
      SELECT id, slug FROM business_locations
      WHERE site_id = ? AND organization_id = ? AND status = 'active'
      ORDER BY is_primary DESC, created_at ASC
      LIMIT 1
    `, [siteId, organizationId])
    : null

  if (siteId) {
    if (locationRow?.id) {
      await updateLocation(db, organizationId, siteId, locationRow.id, {
        title: typeof details?.name === 'string' && details.name.trim() ? details.name.trim() : name,
        city: typeof details?.city === 'string' && details.city.trim() ? details.city.trim() : undefined,
        address: typeof details?.address === 'string' && details.address.trim() ? details.address.trim() : undefined,
        phone: typeof details?.phone === 'string' && details.phone.trim() ? details.phone.trim() : undefined,
        website_url: typeof details?.websiteUrl === 'string' && details.websiteUrl.trim() ? details.websiteUrl.trim() : undefined,
        opening_hours: typeof details?.openingHours === 'string' && details.openingHours.trim() ? details.openingHours.trim() : undefined,
        notification_phone: typeof details?.notificationPhone === 'string' && details.notificationPhone.trim() ? details.notificationPhone.trim() : undefined,
        timezone: typeof details?.timezone === 'string' && details.timezone.trim() ? details.timezone.trim() : undefined,
        is_primary: typeof details?.isPrimary === 'boolean' ? details.isPrimary : undefined,
        status: 'active',
      }, session.user.id)
    }
    await purgeBootstrapCacheSafe(env, siteId)
  }

  return jsonResponse({ success: true, orgSlug: orgRow.slug, siteId, siteSlug, locationSlug: locationRow?.slug ?? null })
})
