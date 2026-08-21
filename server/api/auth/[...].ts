
import { defineHandler } from 'nitro';
import { getQuery } from 'nitro/h3';
import { createAuth } from '~/server/utils/auth'
import { cloudflareEnv } from '~/server/utils/api-response'
import { parsePhoneOrThrow } from '~/utils/phone'
import type { CloudflareEnv } from '~/server/utils/auth'
import { HTTPError, type H3Event } from 'nitro';

import { errorChainForTelemetry } from '~/server/utils/error-telemetry'
import { getRequestDataMetrics, safeRoute } from '~/server/utils/request-metrics'

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
    return new Request(url, { method: request.method, headers: request.headers })
  }

  const pathname = requestUrl.pathname
  const rawBody = await request.arrayBuffer()
  const shouldNormalizePhone = [
    '/api/auth/phone-number/send-otp',
    '/api/auth/phone-number/verify',
    '/api/auth/sign-in/phone-number',
  ].includes(pathname)
  if (!shouldNormalizePhone) {
    return new Request(url, { method: request.method, headers: request.headers, body: rawBody })
  }

  const body = await new Response(rawBody).json().catch(() => null) as { phoneNumber?: unknown } | null
  if (!body || typeof body.phoneNumber !== 'string') {
    return new Request(url, { method: request.method, headers: request.headers, body: rawBody })
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
    
    throw new HTTPError({
      statusCode: 500,
      statusMessage: `Auth error: ${errorMessage}`
    })
  }
})
