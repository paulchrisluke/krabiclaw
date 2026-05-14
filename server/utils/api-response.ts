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
  ...(event.context.cloudflare?.env ?? {})
} as CloudflareEnv)
import type { H3Event } from 'h3'
import type { CloudflareEnv } from './auth'
