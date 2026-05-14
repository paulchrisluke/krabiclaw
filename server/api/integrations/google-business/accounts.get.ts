// Get Google Business accounts and locations
import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getGoogleBusinessConnection, getGoogleBusinessAccounts, getGoogleBusinessLocations } from '../../../utils/google-business'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  
  if (!siteId) {
    return jsonResponse({ 
      error: 'Site ID is required' 
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
    // Verify user has access to the site
    const site = await db.prepare(`
      SELECT s.id, s.organization_id FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ?
      LIMIT 1
    `).bind(siteId, session.user.id).first<{ id: string; organization_id: string }>()
    
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

    // Get accounts
    const accounts = await getGoogleBusinessAccounts(env, connection.encrypted_access_token)
    
    // Get locations for each account
    const accountsWithLocations = await Promise.all(
      accounts.map(async (account) => {
        const locations = await getGoogleBusinessLocations(env, connection.encrypted_access_token, account.name)
        return {
          ...account,
          locations
        }
      })
    )
    
    return jsonResponse({
      success: true,
      connection: {
        id: connection.id,
        providerAccountEmail: connection.provider_account_email,
        status: connection.status,
        connectedAt: connection.created_at
      },
      accounts: accountsWithLocations
    })
    
  } catch (error) {
    console.error('Failed to get Google Business accounts:', error)
    return jsonResponse({ 
      error: 'Failed to get Google Business accounts' 
    }, { status: 500 })
  }
})
