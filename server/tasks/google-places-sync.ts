import type { D1Database } from '@cloudflare/workers-types'
import { syncPlaceToLocation } from '~/server/utils/google-places'
import { queryAll } from '~/server/db'
import { recordUsageEvent } from '~/server/utils/usage-metering'
import { defineScheduledTask } from '~/server/utils/scheduled-task'
import { hasScheduledPaidEntitlement } from '~/server/utils/scheduled-billing-access'

// NOTE: Google Business Profile API access was never provisioned.
// All Google data for every location comes from the Places API (New, v1)
// using GOOGLE_PLACES_API_KEY. This task syncs hours, ratings, and reviews
// for every business_locations row that has google_place_id set.

interface SyncTaskContext {
  cloudflare?: { env?: ApiRecord }
}

interface PlaceLocationRow {
  id: string
  organization_id: string
  site_id: string
  title: string
  google_place_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  access_plan: string | null
  access_expires_at: string | null
  payment_status: string | null
  paid_through: string | null
  past_due_since: string | null
  updated_at: string | null
}

interface PlacesSyncResult {
  location_id: string
  title: string
  organization_id: string
  site_id: string
  reviews_upserted: number
  error?: string
}

interface TaskResult {
  locations: number
  passed: number
  failed: number
  details: PlacesSyncResult[]
}

export default defineScheduledTask({
  meta: {
    name: 'social:google-places-sync',
    description: 'Hourly sync of Google Places hours, ratings, and reviews for all connected locations',
  },
  async run({ context }): Promise<{ result: TaskResult }> {
    const taskContext = context as SyncTaskContext | undefined
    const env = taskContext?.cloudflare?.env ?? {}
    const db = env.DB as D1Database | undefined

    const emptyResult: TaskResult = { locations: 0, passed: 0, failed: 0, details: [] }

    if (!db && import.meta.dev) {
      return { result: emptyResult }
    }
    if (!db) throw new Error('DB is required')

    const apiKey = env.GOOGLE_PLACES_API_KEY as string | undefined
    if (!apiKey) {
      console.warn('[google-places-sync] GOOGLE_PLACES_API_KEY not configured — skipping')
      return { result: emptyResult }
    }

    // The organization billing projection is the authority for paid scheduled
    // integrations; legacy entitlement caches are not access grants here.
    const billingRows = await queryAll<PlaceLocationRow>(db, `
      SELECT bl.id, bl.organization_id, bl.site_id, bl.title, bl.google_place_id,
             ob.stripe_customer_id, ob.stripe_subscription_id, ob.access_plan,
             ob.access_expires_at, ob.payment_status, ob.paid_through, ob.past_due_since, ob.updated_at
      FROM business_locations bl
      INNER JOIN organization_billing ob
        ON ob.organization_id = bl.organization_id
       AND ob.access_plan = 'growth'
      WHERE bl.google_place_id IS NOT NULL
        AND bl.status = 'active'
      ORDER BY bl.organization_id, bl.site_id
    `)
    const locations = billingRows.filter((row) => hasScheduledPaidEntitlement(row, 'google_places'))

    if (locations.length === 0) {
      return { result: emptyResult }
    }

    const syncResults: PlacesSyncResult[] = []
    const runId = crypto.randomUUID()

    for (const loc of locations) {
      const locResult: PlacesSyncResult = {
        location_id: loc.id,
        title: loc.title,
        organization_id: loc.organization_id,
        site_id: loc.site_id,
        reviews_upserted: 0,
      }

      await recordUsageEvent(db, {
        organizationId: loc.organization_id,
        siteId: loc.site_id,
        resource: 'scheduled_task',
        source: 'google_places_sync',
        provider: 'krabiclaw',
        channel: 'google_places',
        quantity: 1,
        unit: 'location_sync',
        metadata: { task: 'social:google-places-sync', locationId: loc.id },
        idempotencyKey: `scheduled-task:${runId}:${loc.id}`,
      })

      try {
        const { reviewsUpserted } = await syncPlaceToLocation(
          db,
          apiKey,
          loc.organization_id,
          loc.site_id,
          loc.id,
          loc.google_place_id
        )
        locResult.reviews_upserted = reviewsUpserted
      } catch (err) {
        locResult.error = err instanceof Error ? err.message : String(err)
        console.error(`[google-places-sync] Places sync failed for location ${loc.id} (${loc.title}):`, locResult.error)
      }

      if (!locResult.error) {
        await recordUsageEvent(db, {
          organizationId: loc.organization_id,
          siteId: loc.site_id,
          resource: 'maps_api',
          source: 'scheduled_task',
          provider: 'google',
          channel: 'places_sync',
          quantity: 1,
          unit: 'location_sync',
          metadata: { task: 'social:google-places-sync', locationId: loc.id },
          idempotencyKey: `maps-api:${runId}:${loc.id}`,
        })
      }

      syncResults.push(locResult)
    }

    return {
      result: {
        locations: locations.length,
        passed: syncResults.filter(r => !r.error).length,
        failed: syncResults.filter(r => r.error).length,
        details: syncResults,
      },
    }
  },
})
