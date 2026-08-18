import type { HTTPEvent } from 'nitro/h3'
import { definePlugin } from 'nitro'
import { isNonIndexableHost, isPrivateSeoPath } from '~/server/utils/seo-policy'
import { hostnameOf, isPreviewContext } from '~/server/utils/tenant-hosts'

const PRODUCTION_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300, max-age=0'
const NON_PRODUCTION_CACHE_CONTROL = 'private, no-store, max-age=0'

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('response', (response, event: HTTPEvent) => {
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) return

    const request = event.req
    const pathname = new URL(request.url).pathname
    if (isPrivateSeoPath(pathname)) return

    const hostname = hostnameOf(request.headers.get('host') || '')
    const nonProduction = isPreviewContext(hostname) || isNonIndexableHost(hostname)

    response.headers.set('cache-control', nonProduction ? NON_PRODUCTION_CACHE_CONTROL : PRODUCTION_CACHE_CONTROL)
    if (nonProduction) {
      response.headers.set('pragma', 'no-cache')
      response.headers.set('expires', '0')
    }
  })
})
