import { HTTPError, defineHandler  } from 'nitro';

import { jsonResponse } from '~/server/utils/api-response'
import { loadDashboardEditorContext } from '~/server/utils/dashboard-editor-resources'

export default defineHandler(async (event) => {
  const organizationId = getRouterParam(event, 'organizationId')
  if (!organizationId) throw new HTTPError({ statusCode: 400, statusMessage: 'Organization ID is required' })
  return jsonResponse(await loadDashboardEditorContext(event, organizationId))
})
import { getRouterParam } from 'nitro/h3';
