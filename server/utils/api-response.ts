import { createError, getHeader, type H3Event } from 'h3'
import { createDb, type AppDb } from '~/server/db'
import type { CloudflareEnv } from './auth'

function normalizeHeaders(headers: HeadersInit): HeadersInit {
  if (headers instanceof Headers) {
    const obj: Record<string, string> = {}
    headers.forEach((value, key) => {
      obj[key] = value
    })
    return obj
  }
  return headers
}

export const jsonResponse = (body: ApiValue, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: normalizeHeaders({
      'content-type': 'application/json; charset=utf-8',
      ...init.headers
    })
  })

export const textResponse = (
  body: string,
  init: ResponseInit = {},
  contentType = 'text/plain; charset=utf-8',
) =>
  new Response(body, {
    ...init,
    headers: normalizeHeaders({
      'content-type': contentType,
      ...init.headers,
    }),
  })

export const cleanString = (value: ApiValue, maxLength: number) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

export const cloudflareEnv = (event: H3Event): CloudflareEnv => {
  const runtimeEnv = (() => {
    const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
    const requiredBindings = ['DB', 'MEDIA_BUCKET', 'SITE_CACHE', 'AI'] as const
    const missing = requiredBindings.filter((key) => !env?.[key])

    if (missing.length > 0) {
      const cfRay = getHeader(event, 'cf-ray') ?? 'no-cf-ray'
      const host = getHeader(event, 'host') ?? 'no-host'
      const path = event.path ?? 'no-path'
      console.error(
        `[cloudflareEnv] FATAL: Missing bindings: ${missing.join(', ')} ` +
        `for ${host}${path} (cf-ray: ${cfRay}). In local dev, run via wrangler dev/yarn dev. ` +
        'In production this means the Workers runtime did not attach bindings to this request — escalate to Cloudflare support with the cf-ray above if it recurs on real traffic.'
      )

      if (process.env.CI === 'true') {
        throw createError({
          statusCode: 503,
          statusMessage: `Cloudflare bindings missing: ${missing.join(', ')}`
        })
      }
    }

    return env ?? {}
  })()

  const d1 = runtimeEnv.DB as D1Database | undefined
  const db = d1 ? createDb(d1) : undefined

  return {
    ...process.env,
    ...runtimeEnv,
    db,
  } as CloudflareEnv
}

export type { AppDb }
