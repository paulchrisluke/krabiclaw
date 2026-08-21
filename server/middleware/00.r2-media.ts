// Serves R2 objects for media.krabiclaw.com.
// Must run before tenant-resolution (filename prefix "00." ensures alphabetical priority).
// Handles range requests so video seeking works in browsers.

import { defineHandler, HTTPError  } from 'nitro';
import type { getHeader} from 'nitro/h3';
import {  sendStream, setHeader, setResponseStatus } from 'nitro/h3';
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
  const runtimeEnv = event.req.runtime?.cloudflare?.env as Record<string, unknown> | undefined
  if (runtimeEnv?.E2E_ALLOW_DEV_ROUTES !== 'true') return false
  const expectedSecret = typeof runtimeEnv.E2E_DEV_ROUTE_SECRET === 'string'
    ? runtimeEnv.E2E_DEV_ROUTE_SECRET
    : ''
  const providedSecret = (event.req.headers.get('x-dev-route-secret')) || ''
  if (!expectedSecret || expectedSecret !== providedSecret) return false
  const hostname = ((event.req.headers.get('host')) || '').split(':')[0] ?? ''
  return hostname === 'localhost' || hostname === '127.0.0.1' || isPreviewContext(hostname)
}

export default defineHandler(async (event) => {
  const host = ((event.req.headers.get('host')) || '').split(':')[0]
  const url = event.url
  const isMediaHost = host === MEDIA_HOST
  const isWorkerMediaPath = url.pathname.startsWith(WORKER_MEDIA_PREFIX) && isWorkerMediaPathAllowed(event)
  if (!isMediaHost && !isWorkerMediaPath) return

  const env = cloudflareEnv(event)
  const bucket = env.MEDIA_BUCKET
  if (!bucket) {
    throw new HTTPError({ statusCode: 503, statusMessage: 'Media storage unavailable' })
  }

  const key = isWorkerMediaPath
    ? url.pathname.slice(WORKER_MEDIA_PREFIX.length)
    : url.pathname.replace(/^\/+/, '')
  if (!key) {
    throw new HTTPError({ statusCode: 400 })
  }

  const rangeHeader = (event.req.headers.get('range'))

  if (rangeHeader) {
    try {
      const head = await bucket.head(key)
      if (!head) throw new HTTPError({ statusCode: 404 })

      const totalSize = head.size
      const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/)
      if (!rangeMatch) {
        setHeader(event, 'content-range', `bytes */${totalSize}`)
        throw new HTTPError({ statusCode: 416 })
      }

      const start = parseInt(rangeMatch[1] ?? '0', 10)
      const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : totalSize - 1

      if (start >= totalSize || start > end || start < 0) {
        setHeader(event, 'content-range', `bytes */${totalSize}`)
        throw new HTTPError({ statusCode: 416 })
      }

      const length = end - start + 1

      const obj = await bucket.get(key, { range: { offset: start, length } })
      if (!obj) throw new HTTPError({ statusCode: 404 })

      setResponseStatus(event, 206)
      setHeader(event, 'content-type', obj.httpMetadata?.contentType ?? 'application/octet-stream')
      setHeader(event, 'content-range', `bytes ${start}-${end}/${totalSize}`)
      setHeader(event, 'content-length', String(length))
      setHeader(event, 'accept-ranges', 'bytes')
      setHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
      return sendStream(event, obj.body)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'R2 error'
      throw new HTTPError({ statusCode: 502, statusMessage: msg })
    }
  }

  try {
    const obj = await bucket.get(key)
    if (!obj) throw new HTTPError({ statusCode: 404 })

    setHeader(event, 'content-type', obj.httpMetadata?.contentType ?? 'application/octet-stream')
    setHeader(event, 'content-length', String(obj.size))
    setHeader(event, 'accept-ranges', 'bytes')
    setHeader(event, 'etag', obj.etag)
    setHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
    return sendStream(event, obj.body)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'R2 error'
    throw new HTTPError({ statusCode: 502, statusMessage: msg })
  }
})
