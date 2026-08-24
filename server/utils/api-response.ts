import { HTTPError } from 'nitro';
import type { H3Event } from 'nitro';
import {  getRequestHost, readBody  } from 'nitro/h3';
import { useRuntimeConfig } from 'nitro/runtime-config';
import { createDb, type AppDb } from '~/server/db'
import type { CloudflareEnv } from './auth'
import { isPreviewContext } from '~/server/utils/tenant-hosts'
import { getRequestDataMetrics, instrumentD1 } from '~/server/utils/request-metrics'

export const jsonResponse = (body: ApiValue, init: ResponseInit = {}) => {
  const mergedHeaders = new Headers(init.headers)
  mergedHeaders.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), {
    ...init,
    headers: mergedHeaders,
  })
}

export async function readRequiredBody<T>(event: H3Event): Promise<T> {
  const body = await readBody<T>(event)
  if (body === undefined) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Request body is required' })
  }
  return body as T
}

export type StrictBodyFieldType = 'string' | 'nullable-string' | 'number' | 'boolean' | 'unknown'

function matchesStrictBodyField(value: unknown, type: StrictBodyFieldType): boolean {
  if (type === 'unknown') return true
  if (type === 'nullable-string') return value === null || typeof value === 'string'
  if (type === 'string') return typeof value === 'string'
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeof value === 'boolean'
}

export async function readStrictBody<T>(event: H3Event, fields: Readonly<Record<string, StrictBodyFieldType>>): Promise<T> {
  const body = await readRequiredBody<Record<string, unknown>>(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HTTPError({ statusCode: 400, statusMessage: 'Request body must be an object' })
  }
  const allowed = new Set(Object.keys(fields))
  const unknown = Object.keys(body).filter(key => !allowed.has(key)).sort()
  if (unknown.length) {
    throw new HTTPError({
      statusCode: 400,
      statusMessage: `Unknown request field${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`,
    })
  }
  for (const [field, value] of Object.entries(body)) {
    if (!matchesStrictBodyField(value, fields[field]!)) {
      throw new HTTPError({ statusCode: 400, statusMessage: `Invalid type for request field: ${field}` })
    }
  }
  return body as T
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

export const apiErrorResponse = (
  event: H3Event,
  status: number,
  code: string,
  message: string,
) => {
  const requestId = getRequestDataMetrics(event).requestId
  return jsonResponse({
    error: { code, message, requestId },
  }, {
    status,
    headers: { 'x-request-id': requestId },
  })
}

export const cleanString = (value: ApiValue, maxLength: number) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

// A generic `catch (error) { return 500 }` block silently swallows a
// new HTTPError() thrown earlier in the same try (e.g. an authorization check
// from server/utils/member-access.ts) into a wrong, generic 500. Call this
// first in every such catch block so an intentional statusCode (401/403/404/...)
// propagates instead of being masked.
export function rethrowHttpError(error: unknown): void {
  if (
    error
    && typeof error === 'object'
    && 'statusCode' in error
    && typeof (error as { statusCode?: unknown }).statusCode === 'number'
  ) {
    throw error
  }
}

// A nested internal self-fetch (event.$fetch/useRequestFetch inside SSR) is a
// synthetic event that Nitro dispatches locally without re-attaching
// event.req.runtime.cloudflare — that's the direct, reliable signal to detect it,
// rather than inferring it from an absent cf-ray header. Middleware that does
// real work (DB pragmas, tenant resolution) should guard on this before doing
// anything, not just when deciding a log level.
export const isInternalSelfFetch = (event: H3Event): boolean =>
  !event.req.runtime?.cloudflare?.env

export const cloudflareEnv = (event: H3Event): CloudflareEnv => {
  const processEnv: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env
  const rawRuntimeEnv = event.req.runtime?.cloudflare?.env as Record<string, unknown> | undefined
  const runtimeEnv = (() => {
    const env = rawRuntimeEnv
    const requiredBindings = ['DB', 'MEDIA_BUCKET', 'SITE_CACHE', 'AI'] as const
    const missing = requiredBindings.filter((key) => !env?.[key])

    if (missing.length > 0) {
      const cfRay = (event.req.headers.get('cf-ray'))
      const host = (event.req.headers.get('host')) ?? 'no-host'
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

      if (rawRuntimeEnv?.CI === 'true' && isRealInboundRequest) {
        throw new HTTPError({
          statusCode: 503,
          statusMessage: `Cloudflare bindings missing: ${missing.join(', ')}`
        })
      }
    }

    return env ?? {}
  })()
  // nitro-dev's rolldown builder inlines a separate, independently-snapshotted copy of
  // #nitro/virtual/runtime-config for any module reached only through a dynamic import() (proven
  // by inspecting .nuxt/dev/index.mjs: two distinct `useRuntimeConfig`/`useRuntimeConfig$N`
  // function bodies, each closing over its own `runtimeConfig` object) — this file is one such
  // module (server/utils/api-response.ts is dynamically imported from composables/useAuthSession.ts
  // and elsewhere per the CLAUDE.md self-fetch pattern), and the inlined copy's snapshot is taken
  // before Nuxt modules finish registering their runtimeConfig.public keys, so `.public` itself is
  // absent rather than merely incomplete. `?? {}` is scoped to exactly that dev-bundler defect, not
  // a stand-in for a real API contract — every value read off `publicConfig` below is optional
  // already and process.env (merged in afterward with higher precedence) supplies the same values.
  const publicConfig = (useRuntimeConfig().public ?? {}) as Record<string, unknown>
  const configuredEnv = {
    ...(typeof publicConfig.platformDomain === 'string' && { NUXT_PUBLIC_PLATFORM_DOMAIN: publicConfig.platformDomain }),
    ...(typeof publicConfig.freeSiteDomain === 'string' && { NUXT_PUBLIC_FREE_SITE_DOMAIN: publicConfig.freeSiteDomain }),
    ...(typeof publicConfig.siteUrl === 'string' && { NUXT_PUBLIC_SITE_URL: publicConfig.siteUrl }),
  }
  const effectiveEnv: Record<string, unknown> = { ...configuredEnv, ...processEnv, ...runtimeEnv }
  const emailDeliveryMode = typeof effectiveEnv.EMAIL_DELIVERY_MODE === 'string' ? effectiveEnv.EMAIL_DELIVERY_MODE : undefined
  const whatsappDeliveryMode = typeof effectiveEnv.WHATSAPP_DELIVERY_MODE === 'string' ? effectiveEnv.WHATSAPP_DELIVERY_MODE : undefined
  const discordDeliveryMode = typeof effectiveEnv.DISCORD_DELIVERY_MODE === 'string' ? effectiveEnv.DISCORD_DELIVERY_MODE : undefined

  const rawD1 = runtimeEnv.DB as D1Database | undefined
  const d1 = rawD1 ? instrumentD1(event, rawD1) : undefined
  const db = d1 ? createDb(d1) : undefined

  // Apply E2E delivery-mode overrides only for approved dev/E2E requests
  const devMode = import.meta.dev
  const e2eOverride = effectiveEnv.E2E_ALLOW_DEV_ROUTES === 'true'
  const allowDevRoute = devMode || e2eOverride
  let e2eDeliveryOverrides: Record<string, string> = {}

  if (allowDevRoute && !devMode && e2eOverride) {
    const expectedSecret = String(effectiveEnv.E2E_DEV_ROUTE_SECRET ?? '')
    const providedSecret = (event.req.headers.get('x-dev-route-secret')) || ''
    const secretValid = expectedSecret && providedSecret && expectedSecret === providedSecret
    const hostname = (getRequestHost(event, { xForwardedHost: true }) || '').split(':')[0] || ''
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1'
    const isPreview = isPreviewContext(hostname)
    const hostAllowed = isLocalHost || isPreview

    if (secretValid && hostAllowed) {
      e2eDeliveryOverrides = {
        ...(emailDeliveryMode !== undefined && { EMAIL_DELIVERY_MODE: emailDeliveryMode }),
        ...(whatsappDeliveryMode !== undefined && { WHATSAPP_DELIVERY_MODE: whatsappDeliveryMode }),
        ...(discordDeliveryMode !== undefined && { DISCORD_DELIVERY_MODE: discordDeliveryMode }),
      }
    }
  } else if (devMode) {
    e2eDeliveryOverrides = {
      ...(emailDeliveryMode !== undefined && { EMAIL_DELIVERY_MODE: emailDeliveryMode }),
      ...(whatsappDeliveryMode !== undefined && { WHATSAPP_DELIVERY_MODE: whatsappDeliveryMode }),
      ...(discordDeliveryMode !== undefined && { DISCORD_DELIVERY_MODE: discordDeliveryMode }),
    }
  }

  return {
    ...effectiveEnv,
    ...e2eDeliveryOverrides,
    DB: d1,
    db,
  } as CloudflareEnv
}

export type { AppDb }
