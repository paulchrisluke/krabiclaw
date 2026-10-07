
import { defineHandler } from 'nitro';
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { cloudflareEnv } from '~/server/utils/api-response'
import { parsePhoneOrThrow } from '~/utils/phone'
import { HTTPError, type H3Event } from 'nitro';

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

async function normalizedPhoneAuthRequest(event: H3Event): Promise<Request> {
  const request = event.req
  const shouldNormalizePhone = request.method === 'POST' && [
    '/api/auth/phone-number/send-otp',
    '/api/auth/phone-number/verify',
  ].includes(new URL(request.url).pathname)
  if (!shouldNormalizePhone) {
    return request as unknown as Request
  }

  const rawBody = await readBoundedBody(request)
  const rawBodyBuffer = rawBody.buffer.slice(rawBody.byteOffset, rawBody.byteOffset + rawBody.byteLength) as ArrayBuffer
  const body = await new Response(rawBodyBuffer).json().catch(() => null) as { phoneNumber?: unknown } | null
  if (!body || typeof body.phoneNumber !== 'string') {
    return new Request(request.url, { method: request.method, headers: request.headers, body: rawBodyBuffer, signal: request.signal })
  }

  const headers = new Headers(request.headers)
  headers.set('content-type', 'application/json')
  headers.delete('content-length')

  return new Request(request.url, {
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

  return auth.handler(await normalizedPhoneAuthRequest(event))
})
