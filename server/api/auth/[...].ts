
import { createAuth } from '~/server/utils/auth'
import { cloudflareEnv } from '~/server/utils/api-response'
import { normalizePhone } from '~/server/utils/whatsapp'
import type { CloudflareEnv } from '~/server/utils/auth'
import type { H3Event } from 'h3'

async function normalizedAuthRequest(event: H3Event): Promise<Request> {
  const request = toWebRequest(event)
  if (request.method !== 'POST') return request

  const pathname = new URL(request.url).pathname
  const shouldNormalizePhone = [
    '/api/auth/phone-number/send-otp',
    '/api/auth/phone-number/verify',
    '/api/auth/sign-in/phone-number',
  ].includes(pathname)
  if (!shouldNormalizePhone) return request

  const body = await request.clone().json().catch(() => null) as { phoneNumber?: unknown } | null
  if (!body || typeof body.phoneNumber !== 'string') return request

  const headers = new Headers(request.headers)
  headers.set('content-type', 'application/json')
  headers.delete('content-length')

  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify({
      ...body,
      phoneNumber: normalizePhone(body.phoneNumber),
    }),
  })
}

export default defineEventHandler(async (event) => {
  const env = cloudflareEnv(event) as CloudflareEnv
  if (!env?.DB) throw createError({ statusCode: 503, message: 'Database unavailable' })

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
    const errorStack = error instanceof Error ? error.stack : undefined
    
    console.error('Auth handler error:', {
      error: errorMessage,
      stack: errorStack,
      url: event.node.req.url,
      method: event.node.req.method
    })
    
    throw createError({
      statusCode: 500,
      statusMessage: `Auth error: ${errorMessage}`
    })
  }
})
