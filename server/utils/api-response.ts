import { createError, getHeader, type H3Event } from 'h3'
import { createDb, type AppDb } from '~/server/db'
import type { CloudflareEnv } from './auth'

export const jsonResponse = (body: ApiValue, init: ResponseInit = {}) => {
  const mergedHeaders = new Headers(init.headers)
  mergedHeaders.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), {
    ...init,
    headers: mergedHeaders,
  })
}

export const textResponse = (
  body: string,
  init: ResponseInit = {},
  contentType = 'text/plain; charset=utf-8',
) => {
  const mergedHeaders = new Headers(init.headers)
  mergedHeaders.set('content-type', contentType)
  return new Response(body, {
    ...init,
    headers: mergedHeaders,
  })
}

export const cleanString = (value: ApiValue, maxLength: number) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

// A nested internal self-fetch (event.$fetch/useRequestFetch inside SSR) is a
// synthetic event that Nitro dispatches locally without re-attaching
// event.context.cloudflare — that's the direct, reliable signal to detect it,
// rather than inferring it from an absent cf-ray header. Middleware that does
// real work (DB pragmas, tenant resolution) should guard on this before doing
// anything, not just when deciding a log level.
export const isInternalSelfFetch = (event: H3Event): boolean =>
  !event.context.cloudflare?.env

export const cloudflareEnv = (event: H3Event): CloudflareEnv => {
  const runtimeEnv = (() => {
    const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
    const requiredBindings = ['DB', 'MEDIA_BUCKET', 'SITE_CACHE', 'AI', 'AI_SEARCH'] as const
    const missing = requiredBindings.filter((key) => !env?.[key])

    if (missing.length > 0) {
      const cfRay = getHeader(event, 'cf-ray')
      const host = getHeader(event, 'host') ?? 'no-host'
      const path = event.path ?? 'no-path'
      const isRealInboundRequest = !isInternalSelfFetch(event)
      const logMessage =
        `[cloudflareEnv] Missing bindings: ${missing.join(', ')} ` +
        `for ${host}${path} (cf-ray: ${cfRay ?? 'no-cf-ray'}). In local dev, run via wrangler dev/yarn dev. ` +
        (isRealInboundRequest
          ? 'In production this means the Workers runtime did not attach bindings to this request — escalate to Cloudflare support with the cf-ray above if it recurs on real traffic.'
          : 'No cf-ray present — this looks like a nested internal self-fetch (event.$fetch/useRequestFetch), which does not inherit Cloudflare bindings. Fetch the data directly instead of self-fetching if this is unexpected.')

      if (isRealInboundRequest) {
        console.error(logMessage)
      } else {
        console.warn(logMessage)
      }

      if (process.env.CI === 'true' && isRealInboundRequest) {
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
  const e2eOverride = process.env.E2E_ALLOW_DEV_ROUTES === 'true'
  const e2eDeliveryOverrides = e2eOverride
    ? {
        EMAIL_DELIVERY_MODE: process.env.EMAIL_DELIVERY_MODE,
        WHATSAPP_DELIVERY_MODE: process.env.WHATSAPP_DELIVERY_MODE,
      }
    : {}

  return {
    ...process.env,
    ...runtimeEnv,
    ...e2eDeliveryOverrides,
    db,
  } as CloudflareEnv
}

export type { AppDb }
