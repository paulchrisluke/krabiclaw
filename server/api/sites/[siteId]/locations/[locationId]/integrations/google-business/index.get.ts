import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getAuthSession } from '~/server/utils/auth'
import { getGoogleBusinessConnection } from '~/server/utils/google-business'
import { queryFirst } from '~/server/db'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')

  if (!siteId || !locationId) {
    return jsonResponse({ error: 'Site ID and Location ID are required' }, { status: 400 })
  }

  const env = cloudflareEnv(event)
  const db = env.DB

  if (!db) {
    return jsonResponse({ error: 'Database not available' }, { status: 500 })
  }

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) {
    return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const site = await queryFirst<{ id: string; organization_id: string }>(db, `
      SELECT s.id, s.organization_id FROM sites s
      JOIN organization o ON s.organization_id = o.id
      JOIN member om ON o.id = om.organizationId
      WHERE s.id = ? AND om.userId = ?
      LIMIT 1
    `, [siteId, session.user.id])

    if (!site) {
      return jsonResponse({ error: 'Site not found or access denied' }, { status: 404 })
    }

    if (typeof site.organization_id !== 'string' || !site.organization_id) {
      return jsonResponse({ error: 'Invalid site data: missing organization_id' }, { status: 500 })
    }

    const connection = await getGoogleBusinessConnection(env, site.organization_id, siteId, locationId)

    if (!connection) {
      return jsonResponse({ success: true, connection: null })
    }

    return jsonResponse({
      success: true,
      connection: {
        id: connection.id,
        provider_account_email: connection.provider_account_email,
        status: connection.status,
        expires_at: connection.expires_at,
        created_at: connection.created_at,
        updated_at: connection.updated_at
      }
    })
  } catch (error) {
    console.error('Failed to get Google Business connection:', error)
    return jsonResponse({ error: 'Failed to get connection status' }, { status: 500 })
  }
})
