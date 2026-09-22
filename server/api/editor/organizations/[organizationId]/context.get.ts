import { HTTPError, defineHandler  } from 'nitro';

import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardEditorContext } from '~/server/utils/dashboard-editor-resources'

export default defineHandler(async (event) => {
  const siteId = getRouterParam(event, 'siteId')
  if (!siteId) throw new HTTPError({ statusCode: 400, statusMessage: 'Site ID is required' })
  return jsonResponse(await loadDashboardEditorContext(event, siteId))
})
import { getRouterParam } from 'nitro/h3';
