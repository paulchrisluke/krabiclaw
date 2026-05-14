// Handle Google Business OAuth callback
import { cloudflareEnv, jsonResponse } from '../../../utils/api-response'
import { exchangeGoogleBusinessCode, storeGoogleBusinessConnection } from '../../../utils/google-business'
import { verifyOAuthState } from '../../../utils/encryption'

interface CallbackRequest {
  code: string
  state: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event) as CallbackRequest
  const { code, state } = body
  
  if (!code || !state) {
    return jsonResponse({ 
      error: 'Authorization code and state are required' 
    }, { status: 400 })
  }
  
  const env = cloudflareEnv(event)
  const db = env.REVIEWS_DB
  
  if (!db) {
    return jsonResponse({ 
      error: 'Database not available' 
    }, { status: 500 })
  }

  try {
    // Parse and validate state parameter — verify HMAC signature
    const hmacSecret = env.CONNECTOR_TOKEN_ENCRYPTION_KEY as string | undefined
    if (!hmacSecret) {
      return jsonResponse({ error: 'Server misconfiguration: encryption key not set' }, { status: 500 })
    }
    const stateData = await verifyOAuthState<{ siteId: string; organizationId: string; userId: string; locationId: string; timestamp: number }>(hmacSecret, state)
    if (!stateData) {
      return jsonResponse({ error: 'Invalid or tampered state parameter' }, { status: 400 })
    }

    const { siteId, organizationId, userId, locationId, timestamp } = stateData

    if (!siteId || !organizationId || !userId || !locationId) {
      return jsonResponse({ error: 'Invalid state: missing required fields' }, { status: 400 })
    }

    // Check state age (should be less than 10 minutes)
    if (Date.now() - timestamp > 10 * 60 * 1000) {
      return jsonResponse({ 
        error: 'Authorization expired. Please try again.' 
      }, { status: 400 })
    }

    // Verify user still has access
    const user = await db.prepare(`
      SELECT email FROM user WHERE id = ?
    `).bind(userId).first()
    
    if (!user) {
      return jsonResponse({ 
        error: 'User not found' 
      }, { status: 404 })
    }

    // Verify user belongs to organization
    const membership = await db.prepare(`
      SELECT role FROM member
      WHERE organizationId = ? AND userId = ? AND role = 'owner'
      LIMIT 1
    `).bind(organizationId, userId).first()
    
    if (!membership) {
      return jsonResponse({ 
        error: 'Access denied' 
      }, { status: 403 })
    }

    // Exchange authorization code for tokens
    const tokenData = await exchangeGoogleBusinessCode(env, code)
    
    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.accessToken}` }
    })
    if (!userInfoResponse.ok) {
      throw new Error(`Failed to fetch user info: ${userInfoResponse.status}`)
    }
    const userInfo = await userInfoResponse.json() as { email?: string }
    if (!userInfo.email) {
      throw new Error('Google user info did not return an email address')
    }
    
    // Store connection
    const connectionId = await storeGoogleBusinessConnection(env, {
      organization_id: organizationId,
      site_id: siteId,
      location_id: locationId,
      connected_by_user_id: userId,
      provider_account_email: userInfo.email,
      encrypted_access_token: tokenData.accessToken,
      encrypted_refresh_token: tokenData.refreshToken,
      scopes: tokenData.scope,
      expires_at: new Date(Date.now() + tokenData.expiresIn * 1000).toISOString(),
      status: 'active'
    })

    return jsonResponse({
      success: true,
      connectionId,
      message: 'Google Business connected successfully'
    })
    
  } catch (error) {
    console.error('Google Business OAuth callback failed:', error)
    return jsonResponse({ 
      error: 'Failed to connect Google Business' 
    }, { status: 500 })
  }
})
