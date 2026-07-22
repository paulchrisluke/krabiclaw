import { jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'

export default defineEventHandler(async (event): Promise<Response> => {
  const rawPath = getRouterParam(event, 'path')
  const path = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '')

  if (path === 'location-preference') {
    return jsonResponse({ error: 'Not found' }, { status: 404 })
  }

  const { site } = await getDashboardContext(event, { requireSite: false })

  if (!site) {
    return jsonResponse({ error: 'Site workspace has not been created yet' }, { status: 400 })
  }

  let target: string
  if (path === 'site') {
    target = `/api/sites/${site.id}`
  } else if (path.startsWith('editor/')) {
    target = `/api/editor/sites/${site.id}/${path.slice('editor/'.length)}`
  } else if (path.startsWith('ai/')) {
    target = `/api/ai/${site.id}/${path.slice('ai/'.length)}`
  } else {
    target = `/api/sites/${site.id}/${path}`
  }

  const method = event.method
  const body = method !== 'GET' && method !== 'HEAD' ? await readRawBody(event) : undefined

  try {
    const data: unknown = await $fetch<unknown>(target, {
      method,
      query: getQuery(event),
      headers: getProxyRequestHeaders(event),
      body
    })
    return jsonResponse(data as ApiValue)
  } catch (error) {
    const fetchError = error as { data?: unknown; status?: number; statusCode?: number }
    return jsonResponse(fetchError.data ?? { error: 'Request failed' }, {
      status: fetchError.status ?? fetchError.statusCode ?? 500
    })
  }
})
