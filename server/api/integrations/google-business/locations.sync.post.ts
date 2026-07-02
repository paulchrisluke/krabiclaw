// Sync selected Google Business locations
import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getGoogleBusinessConnection, syncGoogleLocations } from '../../../utils/google-business'
import { purgeBootstrapCacheSafe } from '~/server/utils/bootstrap-cache'
import { execute, queryFirst } from '~/server/db'

interface SyncLocationsRequest {
  locationIds: string[]
  accountId: string
}

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const body = await readBody(event) as SyncLocationsRequest
  const { locationIds, accountId } = body
  
  if (!siteId || !locationIds || !accountId) {
    return jsonResponse({ 
      error: 'Site ID, location IDs, and account ID are required' 
    }, { status: 400 })
  }
  
  if (!Array.isArray(locationIds) || locationIds.length === 0) {
    return jsonResponse({ 
      error: 'Location IDs must be a non-empty array' 
    }, { status: 400 })
  }
  
  const env = cloudflareEnv(event)
  const db = env.DB
  
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
    // Verify user has access to the site
    const site = await queryFirst<{ id: string; organization_id: string }>(db, `
      SELECT s.id, s.organization_id FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ? AND om.role = 'owner'
      LIMIT 1
    `, [siteId, session.user.id])
    
    if (!site) {
      return jsonResponse({ 
        error: 'Site not found or access denied' 
      }, { status: 404 })
    }

    // Get Google Business connection
    const connection = await getGoogleBusinessConnection(env, site.organization_id, siteId)
    
    if (!connection) {
      return jsonResponse({ 
        error: 'Google Business not connected' 
      }, { status: 404 })
    }

    // Get locations for the account
    const { getGoogleBusinessLocations } = await import('../../../utils/google-business')
    const allLocations = await getGoogleBusinessLocations(env, connection.encrypted_access_token, accountId)
    
    // Filter to selected locations
    const selectedLocations = allLocations.filter(location => 
      locationIds.includes(location.name)
    )
    
    if (selectedLocations.length === 0) {
      return jsonResponse({ 
        error: 'No valid locations found' 
      }, { status: 400 })
    }

    // Set first location as primary if no primary exists
    const existingPrimary = await queryFirst(db, `
      SELECT id FROM business_locations
      WHERE organization_id = ? AND site_id = ? AND is_primary = true AND status = 'active'
      LIMIT 1
    `, [site.organization_id, siteId])

    if (!existingPrimary && selectedLocations.length > 0) {
      // Set first location as primary
      await execute(db, `
        UPDATE business_locations
        SET is_primary = false
        WHERE organization_id = ? AND site_id = ?
      `, [site.organization_id, siteId])
    }

    // Sync locations + their GBP reviews
    const { reviewsUpserted } = await syncGoogleLocations(
      env, site.organization_id, siteId, selectedLocations,
      connection.encrypted_access_token
    )

    // Get synced locations count
    const syncedCount = await queryFirst(db, `
      SELECT COUNT(*) as count FROM business_locations
      WHERE organization_id = ? AND site_id = ? AND status = 'active'
    `, [site.organization_id, siteId])

    await purgeBootstrapCacheSafe(env, siteId)

    return jsonResponse({
      success: true,
      message: `Successfully synced ${selectedLocations.length} locations`,
      syncedCount: (syncedCount as ApiValue)?.count || 0,
      totalLocations: selectedLocations.length,
      reviewsUpserted
    })
    
  } catch (error) {
    console.error('Failed to sync Google Business locations:', error)
    return jsonResponse({ 
      error: 'Failed to sync locations' 
    }, { status: 500 })
  }
})
