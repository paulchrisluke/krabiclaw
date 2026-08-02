import type { H3Event } from 'h3'

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

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    if (isPrivateRoute(event)) return
    html.head = html.head.map(chunk =>
      chunk.replace(/<link\b[^>]*\brel=["']modulepreload["'][^>]*>\s*/gi, ''),
    )
  })
})
