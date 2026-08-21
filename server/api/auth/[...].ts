
import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';
import { createAuth } from '~/server/utils/auth'
import { cloudflareEnv } from '~/server/utils/api-response'
import { parsePhoneOrThrow } from '~/utils/phone'
import type { CloudflareEnv } from '~/server/utils/auth'
import { HTTPError, type H3Event } from 'nitro';

import { errorChainForTelemetry } from '~/server/utils/error-telemetry'
import { getRequestDataMetrics, safeRoute } from '~/server/utils/request-metrics'

const MAX_PHONE_AUTH_BODY_BYTES = 64 * 1024

async function readBoundedBody(request: { headers: Headers; body: ReadableStream<Uint8Array> | null }): Promise<Uint8Array> {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_PHONE_AUTH_BODY_BYTES) {
    throw new HTTPError({ statusCode: 413, statusMessage: 'Auth request body is too large' })
  }
  if (!request.body) return new Uint8Array()

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_PHONE_AUTH_BODY_BYTES) {
      await reader.cancel()
      throw new HTTPError({ statusCode: 413, statusMessage: 'Auth request body is too large' })
    }
    chunks.push(value)
  }

  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

async function normalizedAuthRequest(event: H3Event): Promise<Request> {
  const request = event.req
  const requestUrl = new URL(request.url)
  const query = getQuery(event)
  for (const [key, value] of Object.entries(query)) {
    if (requestUrl.searchParams.has(key)) continue
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) requestUrl.searchParams.append(key, String(item))
    }
  }
  const url = requestUrl.toString()
  if (request.method !== 'POST') {
    return url === request.url
      ? request as unknown as Request
      : new Request(url, { method: request.method, headers: request.headers, signal: request.signal })
  }

  const pathname = requestUrl.pathname
  const shouldNormalizePhone = [
    '/api/auth/phone-number/send-otp',
    '/api/auth/phone-number/verify',
    '/api/auth/sign-in/phone-number',
  ].includes(pathname)
  if (!shouldNormalizePhone) {
    if (url === request.url) return request as unknown as Request
    const init: RequestInit & { duplex: 'half' } = {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: request.signal,
      duplex: 'half',
    }
    return new Request(url, init)
  }

  const rawBody = await readBoundedBody(request)
  const rawBodyBuffer = rawBody.buffer.slice(rawBody.byteOffset, rawBody.byteOffset + rawBody.byteLength) as ArrayBuffer
  const body = await new Response(rawBodyBuffer).json().catch(() => null) as { phoneNumber?: unknown } | null
  if (!body || typeof body.phoneNumber !== 'string') {
    return new Request(url, { method: request.method, headers: request.headers, body: rawBodyBuffer, signal: request.signal })
  }

  const headers = new Headers(request.headers)
  headers.set('content-type', 'application/json')
  headers.delete('content-length')

  return new Request(url, {
    method: request.method,
    headers,
    body: JSON.stringify({
      ...body,
      phoneNumber: parsePhoneOrThrow(body.phoneNumber, { defaultCountry: 'TH' }),
    }),
    signal: request.signal,
  })
}

export default defineHandler(async (event) => {
  const env = cloudflareEnv(event) as CloudflareEnv
  const auth = createAuth(env)
  
  try {
    const request = await normalizedAuthRequest(event)
    const response = await auth.handler(request)
    
    // Check for error responses
    if (response.status >= 400) {
      const responseText = await response.text()
      // 4xx here is routinely an expected OAuth flow outcome, not a fault of
      // ours — e.g. ChatGPT calling /revoke on a token it already rotated out
      // returns 400 "token not found", which used to get logged as `error`
      // and drowned out real signal in Observability. Only 5xx (our server
      // actually faulting) warrants error severity.
      const log = response.status >= 500 ? console.error : console.warn
      log('Auth error response:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText
      })
      return new Response(responseText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
    }
    
    return response
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const metrics = getRequestDataMetrics(event)
    
    try {
      console.error('[AUTH_HANDLER]', JSON.stringify({
        event: 'auth_handler_failed',
        request_id: metrics.requestId,
        ray_id: (event.req.headers.get('cf-ray')) ?? null,
        route: safeRoute(event),
        method: event.req.method,
        duration_ms: Number((performance.now() - metrics.startedAt).toFixed(2)),
        statement_count: metrics.statementCount,
        d1_duration_ms: Number(metrics.d1DurationMs.toFixed(2)),
        error_chain: errorChainForTelemetry(error),
      }))
    } catch {
      // Telemetry must never replace the auth response.
    }

    if (error instanceof HTTPError) throw error
    
    throw new HTTPError({
      statusCode: 500,
      statusMessage: `Auth error: ${errorMessage}`
    })
  }
})
