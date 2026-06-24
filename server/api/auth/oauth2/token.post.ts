import { getHeader, getRequestURL, getHeaders } from 'h3'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { execute, queryFirst } from '~/server/db'

// This route takes precedence over server/api/auth/[...].ts for token exchange.
// Purpose: make authorization_code exchanges idempotent so ChatGPT's two concurrent
// requests (a confirmed behavior) both succeed — the second waits for the first and
// returns the cached response rather than getting "invalid code" from consumeVerificationValue.

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const cfEnv = event.context.cloudflare?.env as CloudflareEnv | undefined
  if (!cfEnv?.DB) throw createError({ statusCode: 503, message: 'Database unavailable' })

  const auth = createAuth(cfEnv)

  const rawBody = await readRawBody(event) ?? ''
  const params = new URLSearchParams(rawBody)
  const code = params.get('code')
  const grantType = params.get('grant_type')
  const clientFingerprint = await safeFingerprint(params.get('client_id'))
  const requestFields = {
    grant_type: grantType ?? 'unknown',
    client_fingerprint: clientFingerprint,
    ray_id: getHeader(event, 'cf-ray') ?? null,
    user_agent: getHeader(event, 'user-agent') ?? null,
  }

  const buildRequest = () => {
    const url = getRequestURL(event)
    const headers = new Headers(getHeaders(event) as Record<string, string>)
    return new Request(url.toString(), { method: 'POST', headers, body: rawBody })
  }

  // Only wrap authorization_code — pass refresh_token and others straight through.
  if (grantType !== 'authorization_code' || !code) {
    const res = await auth.handler(buildRequest())
    const responseBody = await res.text()
    logTokenExchange(res.status >= 400 ? 'warn' : 'info', {
      ...requestFields,
      status: res.status,
      duration_ms: Date.now() - startedAt,
      ...tokenResponseSummary(responseBody),
    })
    return new Response(responseBody, { status: res.status, headers: res.headers })
  }

  const now = new Date().toISOString()
  const expiresAt = new Date(Date.now() + 90_000).toISOString()

  // Prune expired entries (best-effort, non-blocking on failure).
  execute(cfEnv.DB, 'DELETE FROM token_exchange_cache WHERE expires_at < ?', [now]).catch(() => null)

  // Atomic claim via INSERT OR IGNORE. First concurrent request wins (changes = 1).
  const insertResult = await execute(
    cfEnv.DB,
    `INSERT OR IGNORE INTO token_exchange_cache (code, state, response_body, http_status, created_at, expires_at)
     VALUES (?, 'pending', '', 0, ?, ?)`,
    [code, now, expiresAt],
  )

  const claimed = Number(insertResult.meta.changes ?? 0) === 1

  if (!claimed) {
    // A concurrent request already claimed this code. Poll for its result.
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 250))
      const cached = await queryFirst<{ response_body: string; http_status: number }>(
        cfEnv.DB,
        `SELECT response_body, http_status FROM token_exchange_cache WHERE code = ? AND state = 'done'`,
        [code],
      )
      if (cached) {
        logTokenExchange(cached.http_status >= 400 ? 'warn' : 'info', {
          ...requestFields,
          status: cached.http_status,
          duration_ms: Date.now() - startedAt,
          idempotency_cache: 'hit',
          ...tokenResponseSummary(cached.response_body),
        })
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

  logTokenExchange(res.status >= 400 ? 'warn' : 'info', {
    ...requestFields,
    status: res.status,
    duration_ms: Date.now() - startedAt,
    idempotency_cache: claimed ? 'miss' : 'timeout',
    ...tokenResponseSummary(responseBody),
  })

  // Persist result so concurrent duplicates can use it.
  await execute(
    cfEnv.DB,
    `UPDATE token_exchange_cache SET state = 'done', response_body = ?, http_status = ? WHERE code = ?`,
    [responseBody, res.status, code],
  ).catch(err =>
    console.error('[Token] failed to store exchange result:', err)
  )

  return new Response(responseBody, { status: res.status, headers: res.headers })
})

async function safeFingerprint(value: string | null) {
  if (!value) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Buffer.from(digest).toString('base64url').slice(0, 12)
}

function tokenResponseSummary(responseBody: string) {
  try {
    const body = JSON.parse(responseBody) as Record<string, unknown>
    return {
      oauth_error: typeof body.error === 'string' ? body.error : null,
      access_token_issued: typeof body.access_token === 'string',
      refresh_token_issued: typeof body.refresh_token === 'string',
      id_token_issued: typeof body.id_token === 'string',
      expires_in: typeof body.expires_in === 'number' ? body.expires_in : null,
      scope: typeof body.scope === 'string' ? body.scope : null,
    }
  } catch {
    return {
      oauth_error: 'invalid_response_body',
      access_token_issued: false,
      refresh_token_issued: false,
      id_token_issued: false,
      expires_in: null,
      scope: null,
    }
  }
}

function logTokenExchange(level: 'info' | 'warn', fields: Record<string, unknown>) {
  console[level]('[OAUTH_TOKEN]', JSON.stringify({
    event: 'token_exchange',
    ...fields,
  }))
}
