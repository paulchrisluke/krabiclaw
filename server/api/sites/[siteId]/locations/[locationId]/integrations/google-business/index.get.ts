import { jsonResponse } from '~/server/utils/api-response'
import { getGoogleBusinessConnection } from '~/server/utils/google-business'
import { requireLocationAccess } from '~/server/utils/location-access'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const locationId = getRouterParam(event, 'locationId')

  if (!siteId || !locationId) {
    return jsonResponse({ error: 'Site ID and Location ID are required' }, { status: 400 })
  }

  const { env, site } = await requireLocationAccess(event, siteId, locationId)

  try {
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
