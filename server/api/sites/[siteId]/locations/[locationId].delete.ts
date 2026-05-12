// Delete a business location from a site
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { updateSubscriptionQuantity } from '~/server/utils/billing'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')

  if (!siteId || !locationId) {
    return jsonResponse({ error: 'Site ID and location ID are required' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const site = await db.prepare(`
      SELECT s.id, s.organization_id, s.primary_location_id
      FROM sites s
      JOIN member om ON s.organization_id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role IN ('owner', 'admin')
      LIMIT 1
    `).bind(siteId, session.user.id).first<{ id: string; organization_id: string; primary_location_id: string | null }>()

    if (!site) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }

    const existingLocation = await db.prepare(`
      SELECT id
      FROM business_locations
      WHERE id = ? AND organization_id = ? AND site_id = ?
      LIMIT 1
    `).bind(locationId, site.organization_id, siteId).first()

    if (!existingLocation) {
      return jsonResponse({ error: 'Location not found' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const statements = [
      db.prepare(`
        DELETE FROM business_locations
        WHERE id = ? AND organization_id = ? AND site_id = ?
      `).bind(locationId, site.organization_id, siteId)
    ]

    if (site.primary_location_id === locationId) {
      statements.push(db.prepare(`
        UPDATE sites
        SET primary_location_id = NULL, updated_at = ?, updated_by = ?
        WHERE id = ? AND organization_id = ?
      `).bind(now, session.user.id, siteId, site.organization_id))
    }

    await db.batch(statements)

    // Run in background when supported; otherwise await to keep sync reliable.
    const syncPromise = updateSubscriptionQuantity(env, db, site.organization_id).catch((err) =>
      console.error('Failed to update Stripe subscription quantity after location delete:', err)
    )
    const waitUntil = event.context.cloudflare?.context?.waitUntil as ((promise: Promise<unknown>) => void) | undefined
    if (typeof waitUntil === 'function') {
      waitUntil(syncPromise)
    } else {
      await syncPromise
    }

    return jsonResponse({
      success: true,
      message: 'Location deleted successfully',
      siteId,
      locationId
    })
  } catch (error) {
    console.error('Failed to delete business location:', error)
    return jsonResponse({ error: 'Failed to delete business location' }, { status: 500 })
  }
})
