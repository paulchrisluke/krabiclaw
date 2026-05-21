import { getDashboardRestaurant } from '~/server/utils/dashboard-context'

export default defineEventHandler(async (event) => {
  const rawPath = getRouterParam(event, 'path')
  const path = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '')
  const { restaurant } = await getDashboardRestaurant(event)

  let target: string
  if (path === 'restaurant') {
    target = `/api/sites/${restaurant.id}`
  } else if (path.startsWith('editor/')) {
    target = `/api/editor/sites/${restaurant.id}/${path.slice('editor/'.length)}`
  } else if (path.startsWith('ai/')) {
    target = `/api/ai/${restaurant.id}/${path.slice('ai/'.length)}`
  } else {
    target = `/api/sites/${restaurant.id}/${path}`
  }

  const url = new URL(target, getRequestURL(event).origin)
  for (const [key, value] of Object.entries(getQuery(event))) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item))
    } else if (value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  }

  return proxyRequest(event, url.toString())
})
