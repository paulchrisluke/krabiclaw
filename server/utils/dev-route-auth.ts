import { createError, getHeader, getRequestHost } from 'h3'
import type { H3Event } from 'h3'
import { isPreviewContext } from '~/server/utils/tenant-hosts'

const textEncoder = new TextEncoder()

export function timingSafeEqualText(a: string, b: string): boolean {
  const left = textEncoder.encode(a)
  const right = textEncoder.encode(b)
  if (left.length !== right.length) {
    let _noop = 0
    for (let i = 0; i < left.length; i += 1) _noop |= left[i]!
    return false
  }
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!
  return diff === 0
}

function isLocalHost(hostname: string) {
  return hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === '127.0.0.1'
    || hostname === '::1'
}

export function assertDevRouteAllowed(event: H3Event) {
  const devMode = import.meta.dev
  const e2eOverride = process.env.E2E_ALLOW_DEV_ROUTES === 'true'
  const allowDevRoute = devMode || e2eOverride
  if (!allowDevRoute) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const hostname = (getRequestHost(event) || '').split(':')[0] || ''
  const expectedSecret = process.env.E2E_DEV_ROUTE_SECRET || ''
  const providedSecret = getHeader(event, 'x-dev-route-secret') || ''

  // In plain localhost dev, keep the current convenience behavior. But once a
  // dev server is exposed through a real host (e.g. local tunnel for ChatGPT
  // connector testing), require the same shared secret header we use in CI so
  // /api/dev/* routes are not publicly reachable.
  if (devMode && !isLocalHost(hostname)) {
    if (!expectedSecret || !providedSecret || !timingSafeEqualText(providedSecret, expectedSecret)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }
  }

  if (!devMode && e2eOverride) {
    if (!expectedSecret || !providedSecret || !timingSafeEqualText(providedSecret, expectedSecret)) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
    }

    // Belt-and-suspenders: E2E_ALLOW_DEV_ROUTES is only meant to be set on
    // preview/staging (wrangler.toml [env.preview]/[env.staging]). If it ever
    // leaks into a production-looking deploy, this login-bypass route would
    // otherwise become a live impersonate-any-user backdoor. Gate on the
    // request host too, so a config mistake 404s instead of granting access.
    if (!isLocalHost(hostname) && !isPreviewContext(hostname)) {
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    }
  }
}
