// Serves R2 objects for media.krabiclaw.com.
// Must run before tenant-resolution (filename prefix "00." ensures alphabetical priority).
// Handles range requests so video seeking works in browsers.

import { defineEventHandler, getHeader, getRequestURL, sendStream, setHeader, setResponseStatus, createError, sendError } from 'h3'
import { cloudflareEnv } from '~/server/utils/api-response'

const MEDIA_HOST = 'media.krabiclaw.com'

export default defineEventHandler(async (event) => {
  const host = (getHeader(event, 'host') || '').split(':')[0]
  if (host !== MEDIA_HOST) return

  const env = cloudflareEnv(event)
  const bucket = env.MEDIA_BUCKET
  if (!bucket) {
    return sendError(event, createError({ statusCode: 503, statusMessage: 'Media storage unavailable' }))
  }

  const url = getRequestURL(event)
  const key = url.pathname.replace(/^\/+/, '')
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
