export const jsonResponse = (body: ApiValue, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...init.headers
    }
  })

export const cleanString = (value: ApiValue, maxLength: number) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

export const cloudflareEnv = (event: H3Event): CloudflareEnv => ({
  ...process.env,
  ...(() => {
    const env = event.context.cloudflare?.env as Record<string, unknown> | undefined
    const requiredBindings = ['DB', 'MEDIA_BUCKET', 'SITE_CACHE', 'AI'] as const
    const missing = requiredBindings.filter((key) => !env?.[key])

    if (missing.length > 0) {
      console.error(
        `[cloudflareEnv] FATAL: Missing bindings: ${missing.join(', ')}. ` +
        'Ensure wrangler.toml sets remote = false and Cloudflare dev bindings are active.'
      )

      if (process.env.CI === 'true') {
        throw new Error(`Cloudflare bindings missing: ${missing.join(', ')}`)
      }
    }

    return env ?? {}
  })()
} as CloudflareEnv)
import type { H3Event } from 'h3'
import type { CloudflareEnv } from './auth'
