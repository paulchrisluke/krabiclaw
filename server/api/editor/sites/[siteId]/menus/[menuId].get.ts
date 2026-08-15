// GET single menu with items
import { jsonResponse, rethrowHttpError } from '~/server/utils/api-response'
import { loadDashboardMenu } from '~/server/utils/dashboard-editor-resources'

export default defineEventHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  const menuId = getRouterParam(event, 'menuId')

  if (!siteId || !menuId) {
    return jsonResponse({ error: 'Site ID and menu ID are required' }, { status: 400 })
  }

  try {
    return jsonResponse(await loadDashboardMenu(event, siteId, menuId))
  } catch (error) {
    rethrowHttpError(error)
    console.error('Failed to get menu:', error)
    return jsonResponse({ error: 'Failed to get menu' }, { status: 500 })
  }
})
import { defineEventHandler } from 'h3'
import { getRouterParam } from 'h3'
