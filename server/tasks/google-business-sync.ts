import type { D1Database } from '@cloudflare/workers-types'
import {
  getGoogleBusinessAccounts,
  getGoogleBusinessLocations,
  syncGoogleLocations,
} from '~/server/utils/google-business'
import { syncPlaceToLocation } from '~/server/utils/google-places'
import { decryptSecret, encryptionEnv } from '~/server/utils/encryption'

interface SyncTaskContext {
  cloudflare?: { env?: ApiRecord }
}

interface GbConnectionRow {
  id: string
  organization_id: string
  site_id: string
  encrypted_refresh_token: string
  status: string
}

interface PlaceLocationRow {
  id: string
  organization_id: string
  site_id: string
  google_place_id: string
}

interface GbSyncResult {
  connection_id: string
  organization_id: string
  site_id: string
  locations_synced: number
  error?: string
}

interface PlacesSyncResult {
  location_id: string
  organization_id: string
  site_id: string
  reviews_upserted: number
  error?: string
}

interface TaskResult {
  google_business: { connections: number; passed: number; failed: number; details: GbSyncResult[] }
  google_places: { locations: number; passed: number; failed: number; details: PlacesSyncResult[] }
}

export default defineTask({
  meta: {
    name: 'social:google-business-sync',
    description: 'Hourly sync of Google Business Profile locations and Google Places reviews for managed-service orgs',
  },
  async run({ context }): Promise<{ result: TaskResult }> {
    const taskContext = context as SyncTaskContext | undefined
    const env = taskContext?.cloudflare?.env ?? {}
    const db = env.DB as D1Database | undefined

    const emptyResult: TaskResult = {
      google_business: { connections: 0, passed: 0, failed: 0, details: [] },
      google_places: { locations: 0, passed: 0, failed: 0, details: [] },
    }

    if (!db && import.meta.dev) {
      return { result: emptyResult }
    }
    if (!db) throw new Error('DB is required')

    const googleClientId = env.GOOGLE_BUSINESS_CLIENT_ID as string | undefined
    const googleClientSecret = env.GOOGLE_BUSINESS_CLIENT_SECRET as string | undefined

    // ── Google Business Profile sync ────────────────────────────────────────
    // Only sync orgs with managed_service entitlement
    const { results: gbRows } = await db.prepare(`
      SELECT gbc.id, gbc.organization_id, gbc.site_id, gbc.encrypted_refresh_token
      FROM google_business_connections gbc
      INNER JOIN organization_entitlements oe
        ON oe.organization_id = gbc.organization_id
        AND oe.key = 'managed_service'
        AND oe.value = 'true'
      WHERE gbc.status = 'active'
      ORDER BY gbc.organization_id
    `).all()

    const gbConnections = (gbRows ?? []) as unknown as GbConnectionRow[]
    const gbResults: GbSyncResult[] = []

    for (const conn of gbConnections) {
      const connResult: GbSyncResult = {
        connection_id: conn.id,
        organization_id: conn.organization_id,
        site_id: conn.site_id,
        locations_synced: 0,
      }

      try {
        if (!googleClientId || !googleClientSecret) {
          throw new Error('GOOGLE_BUSINESS_CLIENT_ID or GOOGLE_BUSINESS_CLIENT_SECRET not configured')
        }

        const tokenEnv = encryptionEnv(env)
        const refreshToken = await decryptSecret(conn.encrypted_refresh_token, tokenEnv)

        // Refresh the access token using the stored refresh token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: googleClientId,
            client_secret: googleClientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
        })
        if (!tokenResponse.ok) {
          const text = await tokenResponse.text()
          throw new Error(`Token refresh failed: ${text.slice(0, 200)}`)
        }
        const tokenData = await tokenResponse.json() as { access_token?: string }
        if (!tokenData.access_token) throw new Error('Token refresh response missing access_token')

        const accessToken = tokenData.access_token
        const gbEnv = { ...env, DB: db } as Parameters<typeof getGoogleBusinessAccounts>[0]

        const accounts = await getGoogleBusinessAccounts(gbEnv, accessToken)
        for (const account of accounts) {
          const accountId = account.name.split('/').pop() ?? account.name
          const locations = await getGoogleBusinessLocations(gbEnv, accessToken, accountId)
          await syncGoogleLocations(gbEnv, conn.organization_id, conn.site_id, conn.id, locations)
          connResult.locations_synced += locations.length
        }
      } catch (err) {
        connResult.error = err instanceof Error ? err.message : String(err)
        console.error(`[google-business-sync] failed for connection ${conn.id}:`, connResult.error)

        await db.prepare(`
          UPDATE google_business_connections SET status = 'error', updated_at = ? WHERE id = ?
        `).bind(new Date().toISOString(), conn.id).run().catch(() => {})
      }

      gbResults.push(connResult)
    }

    // ── Google Places sync ─────────────────────────────────────────────────
    // Sync reviews, hours, and ratings for every location that has a google_place_id
    const googlePlacesApiKey = env.GOOGLE_PLACES_API_KEY as string | undefined
    const placesResults: PlacesSyncResult[] = []

    if (googlePlacesApiKey) {
      const { results: placeRows } = await db.prepare(`
        SELECT bl.id, bl.organization_id, bl.site_id, bl.google_place_id
        FROM business_locations bl
        INNER JOIN organization_entitlements oe
          ON oe.organization_id = bl.organization_id
          AND oe.key = 'managed_service'
          AND oe.value = 'true'
        WHERE bl.google_place_id IS NOT NULL
          AND bl.status = 'active'
        ORDER BY bl.organization_id
      `).all()

      const placeLocations = (placeRows ?? []) as unknown as PlaceLocationRow[]

      for (const loc of placeLocations) {
        const placeResult: PlacesSyncResult = {
          location_id: loc.id,
          organization_id: loc.organization_id,
          site_id: loc.site_id,
          reviews_upserted: 0,
        }

        try {
          const { reviewsUpserted } = await syncPlaceToLocation(
            db,
            googlePlacesApiKey,
            loc.organization_id,
            loc.site_id,
            loc.id,
            loc.google_place_id
          )
          placeResult.reviews_upserted = reviewsUpserted
        } catch (err) {
          placeResult.error = err instanceof Error ? err.message : String(err)
          console.error(`[google-business-sync] Places sync failed for location ${loc.id}:`, placeResult.error)
        }

        placesResults.push(placeResult)
      }
    }

    return {
      result: {
        google_business: {
          connections: gbConnections.length,
          passed: gbResults.filter(r => !r.error).length,
          failed: gbResults.filter(r => r.error).length,
          details: gbResults,
        },
        google_places: {
          locations: placesResults.length,
          passed: placesResults.filter(r => !r.error).length,
          failed: placesResults.filter(r => r.error).length,
          details: placesResults,
        },
      },
    }
  },
})
