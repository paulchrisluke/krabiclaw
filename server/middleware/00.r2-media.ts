// Serves R2 objects for media.krabiclaw.com.
// Must run before tenant-resolution (filename prefix "00." ensures alphabetical priority).
// Handles range requests so video seeking works in browsers.

import { defineEventHandler, getHeader, getRequestURL, sendStream, setHeader, setResponseStatus, createError, sendError } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'
import { isPreviewContext } from '~/server/utils/tenant-hosts'

const MEDIA_HOST = 'media.krabiclaw.com'
const WORKER_MEDIA_PREFIX = '/__media/'

// Local single-origin quick-tunnel harnesses (no separate media.krabiclaw.com
// host available) need media served from the same origin as the app. Gated
// the same way cloudflareEnv()'s E2E delivery-mode override is: dev mode, or
// an explicit opt-in env flag plus a matching shared secret from an
// allowed host — never host-agnostic, or any production tenant domain could
// hit /__media/* and read straight from the R2 bucket.
function isWorkerMediaPathAllowed(event: Parameters<typeof getHeader>[0]): boolean {
  if (import.meta.dev) return true
  if (process.env.E2E_ALLOW_DEV_ROUTES !== 'true') return false
  const expectedSecret = process.env.E2E_DEV_ROUTE_SECRET || ''
  const providedSecret = getHeader(event, 'x-dev-route-secret') || ''
  if (!expectedSecret || expectedSecret !== providedSecret) return false
  const hostname = (getHeader(event, 'host') || '').split(':')[0] ?? ''
  return hostname === 'localhost' || hostname === '127.0.0.1' || isPreviewContext(hostname)
}

export default defineEventHandler(async (event) => {
  const host = (getHeader(event, 'host') || '').split(':')[0]
  const url = getRequestURL(event)
  const isMediaHost = host === MEDIA_HOST
  const isWorkerMediaPath = url.pathname.startsWith(WORKER_MEDIA_PREFIX) && isWorkerMediaPathAllowed(event)
  if (!isMediaHost && !isWorkerMediaPath) return

  const env = cloudflareEnv(event)
  const bucket = env.MEDIA_BUCKET
  if (!bucket) {
    return sendError(event, createError({ statusCode: 503, statusMessage: 'Media storage unavailable' }))
  }

  const key = isWorkerMediaPath
    ? url.pathname.slice(WORKER_MEDIA_PREFIX.length)
    : url.pathname.replace(/^\/+/, '')
  if (!key) {
    return sendError(event, createError({ statusCode: 400 }))
  }

  const rangeHeader = getHeader(event, 'range')

  if (rangeHeader) {
    try {
      const head = await bucket.head(key)
      if (!head) return sendError(event, createError({ statusCode: 404 }))

      const totalSize = head.size
      const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/)
      if (!rangeMatch) {
        setHeader(event, 'content-range', `bytes */${totalSize}`)
        return sendError(event, createError({ statusCode: 416 }))
      }

      const start = parseInt(rangeMatch[1] ?? '0', 10)
      const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : totalSize - 1

      if (start >= totalSize || start > end || start < 0) {
        setHeader(event, 'content-range', `bytes */${totalSize}`)
        return sendError(event, createError({ statusCode: 416 }))
      }

      const length = end - start + 1

      const obj = await bucket.get(key, { range: { offset: start, length } })
      if (!obj) return sendError(event, createError({ statusCode: 404 }))

      setResponseStatus(event, 206)
      setHeader(event, 'content-type', obj.httpMetadata?.contentType ?? 'application/octet-stream')
      setHeader(event, 'content-range', `bytes ${start}-${end}/${totalSize}`)
      setHeader(event, 'content-length', length)
      setHeader(event, 'accept-ranges', 'bytes')
      setHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
      return sendStream(event, obj.body)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'R2 error'
      return sendError(event, createError({ statusCode: 502, statusMessage: msg }))
    }
  }

  try {
    const obj = await bucket.get(key)
    if (!obj) return sendError(event, createError({ statusCode: 404 }))

    setHeader(event, 'content-type', obj.httpMetadata?.contentType ?? 'application/octet-stream')
    setHeader(event, 'content-length', obj.size)
    setHeader(event, 'accept-ranges', 'bytes')
    setHeader(event, 'etag', obj.etag)
    setHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
    return sendStream(event, obj.body)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'R2 error'
    return sendError(event, createError({ statusCode: 502, statusMessage: msg }))
  }
})
