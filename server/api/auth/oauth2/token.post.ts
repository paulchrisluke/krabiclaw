import { getRequestURL, getHeaders } from 'h3'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'

// This route takes precedence over server/api/auth/[...].ts for token exchange.
// Purpose: make authorization_code exchanges idempotent so ChatGPT's two concurrent
// requests (a confirmed behavior) both succeed — the second waits for the first and
// returns the cached response rather than getting "invalid code" from consumeVerificationValue.

export default defineEventHandler(async (event) => {
  const cfEnv = event.context.cloudflare?.env as CloudflareEnv | undefined
  if (!cfEnv?.DB) throw createError({ statusCode: 503, message: 'Database unavailable' })

  const auth = createAuth(cfEnv)

  const rawBody = await readRawBody(event) ?? ''
  const params = new URLSearchParams(rawBody)
  const code = params.get('code')
  const grantType = params.get('grant_type')

  const buildRequest = () => {
    const url = getRequestURL(event)
    const headers = new Headers(getHeaders(event) as Record<string, string>)
    return new Request(url.toString(), { method: 'POST', headers, body: rawBody })
  }

  // Only wrap authorization_code — pass refresh_token and others straight through.
  if (grantType !== 'authorization_code' || !code) {
    const res = await auth.handler(buildRequest())
    if (res.status >= 400) {
      const text = await res.text()
      console.error('[Token] non-code grant error:', { status: res.status, body: text })
      return new Response(text, { status: res.status, headers: res.headers })
    }
    return res
  }

  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 90_000).toISOString()

  // Prune expired entries (best-effort, non-blocking on failure).
  cfEnv.DB.prepare('DELETE FROM token_exchange_cache WHERE expires_at < ?')
    .bind(now).run().catch(() => null)

  // Atomic claim via INSERT OR IGNORE. First concurrent request wins (changes = 1).
  const insertResult = await cfEnv.DB.prepare(
    `INSERT OR IGNORE INTO token_exchange_cache (code, state, response_body, http_status, created_at, expires_at)
     VALUES (?, 'pending', '', 0, ?, ?)`
  ).bind(code, now, expiresAt).run()

  const claimed = (insertResult.meta as { changes?: number }).changes === 1

  if (!claimed) {
    // A concurrent request already claimed this code. Poll for its result.
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 250))
      const cached = await cfEnv.DB.prepare(
        `SELECT response_body, http_status FROM token_exchange_cache WHERE code = ? AND state = 'done'`
      ).bind(code).first<{ response_body: string; http_status: number }>()
      if (cached) {
        console.log('[Token] idempotency: returning cached exchange result')
        return new Response(cached.response_body, {
          status: cached.http_status,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    // Timed out (3s) — fall through and try directly (primary may have failed).
    console.error('[Token] idempotency wait timed out, attempting direct exchange')
  }

  // Exchange the code with better-auth.
  const res = await auth.handler(buildRequest())
  const responseBody = await res.text()

  if (res.status >= 400) {
    console.error('[Token] code exchange error:', { status: res.status, body: responseBody })
  }

  // Persist result so concurrent duplicates can use it.
  await cfEnv.DB.prepare(
    `UPDATE token_exchange_cache SET state = 'done', response_body = ?, http_status = ? WHERE code = ?`
  ).bind(responseBody, res.status, code).run().catch(err =>
    console.error('[Token] failed to store exchange result:', err)
  )

  return new Response(responseBody, { status: res.status, headers: res.headers })
})
