import { getHeader, getRequestURL, type H3Event } from 'h3'
import { publicSurfaceStylesheetForRequest } from '~/utils/public-surface-hints'

const PRIVATE_ROUTE_PREFIXES = [
  '/dashboard',
  '/admin',
  '/api/',
  '/auth/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/oauth/',
]

const isPrivateRoute = (event: H3Event) =>
  PRIVATE_ROUTE_PREFIXES.some(prefix => event.path === prefix || event.path.startsWith(`${prefix}/`))

function addStylesheetPreload(response: { headers?: Record<string, string> }, event: H3Event) {
  if (import.meta.dev) return
  if (event.method !== 'GET' || isPrivateRoute(event)) return
  if (!getHeader(event, 'accept')?.includes('text/html')) return

  const pathname = getRequestURL(event).pathname
  const href = publicSurfaceStylesheetForRequest({
    pathname,
    tenantType: event.context.tenantType,
    themeId: event.context.themeId,
    vertical: event.context.site?.vertical,
  })
  if (!href) return

  response.headers = {
    ...response.headers,
    link: [response.headers?.link, `<${href}>; rel=preload; as=style`].filter(Boolean).join(', '),
  }
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', (response, { event }) => {
    addStylesheetPreload(response, event)
  })

  nitroApp.hooks.hook('render:html', (html, { event }) => {
    if (isPrivateRoute(event)) return
    html.head = html.head.map(chunk =>
      chunk.replace(/<link\b[^>]*\brel=["']modulepreload["'][^>]*>\s*/gi, ''),
    )
  })
})
