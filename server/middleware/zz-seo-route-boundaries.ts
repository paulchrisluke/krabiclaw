import { createError, defineEventHandler, getRequestURL } from 'h3'
import { TENANT_TYPES } from '~/utils/tenant-routing'

const TENANT_ONLY_EXACT_ROUTES = new Set([
  '/contact',
  '/experiences',
  '/locations',
  '/menu',
  '/order',
  '/photos',
  '/posts',
  '/qa',
  '/reservations',
  '/reviews',
])

const TENANT_ONLY_PREFIXES = [
  '/contact/',
  '/experiences/',
  '/locations/',
  '/menu/',
  '/order/',
  '/photos/',
  '/posts/',
  '/qa/',
  '/reservations/',
  '/reviews/',
]

export default defineEventHandler((event) => {
  if (event.context.tenantType !== TENANT_TYPES.PLATFORM) return

  const pathname = getRequestURL(event).pathname
  const tenantOnly = TENANT_ONLY_EXACT_ROUTES.has(pathname)
    || TENANT_ONLY_PREFIXES.some(prefix => pathname.startsWith(prefix))

  if (!tenantOnly) return

  throw createError({
    statusCode: 404,
    statusMessage: 'Page not found',
  })
})
