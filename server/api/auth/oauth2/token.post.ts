import { getHeader, getRequestURL, getHeaders } from 'h3'
import { createAuth, type CloudflareEnv } from '~/server/utils/auth'
import { execute, queryFirst } from '~/server/db'
import { cloudflareEnv } from '~/server/utils/api-response'
import { errorChainForTelemetry } from '~/server/utils/error-telemetry'
import { getRequestDataMetrics, recordRequestPhase } from '~/server/utils/request-metrics'

// This route takes precedence over server/api/auth/[...].ts for token exchange.
// Purpose: make authorization_code exchanges idempotent so ChatGPT's two concurrent
// requests (a confirmed behavior) both succeed — the second waits for the first and
// returns the cached response rather than getting "invalid code" from consumeVerificationValue.

export default defineEventHandler(async (event) => {
  const startedAt = Date.now()
  const requestMetrics = getRequestDataMetrics(event)
  const cfEnv = cloudflareEnv(event) as CloudflareEnv
  if (!cfEnv?.DB) throw createError({ statusCode: 503, message: 'Database unavailable' })

  const cloudflareContext = event.context.cloudflare?.context
  const waitUntil = cloudflareContext?.waitUntil?.bind(cloudflareContext)
  const auth = createAuth(cfEnv, { waitUntil })

  const rawBody = await readRawBody(event) ?? ''
  const params = new URLSearchParams(rawBody)
  const code = params.get('code')
  const grantType = params.get('grant_type')
  const clientFingerprint = await safeFingerprint(params.get('client_id'))
  const rayId = getHeader(event, 'cf-ray') ?? null
  const requestFields = {
    grant_type: grantType ?? 'unknown',
    client_fingerprint: clientFingerprint,
    request_id: requestMetrics.requestId,
    ray_id: rayId,
    request_colo: rayId?.split('-').at(-1) ?? null,
    deployment_version: String(
      cfEnv.DEPLOYMENT_VERSION ?? cfEnv.CF_PAGES_COMMIT_SHA ?? cfEnv.GITHUB_SHA ?? 'unknown',
    ),
    user_agent: getHeader(event, 'user-agent') ?? null,
  }
  let failedPhase = 'better_auth'

  const buildRequest = () => {
    const url = getRequestURL(event)
    const headers = new Headers(getHeaders(event) as Record<string, string>)
    return new Request(url.toString(), { method: 'POST', headers, body: rawBody })
  }

  const runAuthHandler = async () => {
    failedPhase = 'better_auth'
    const phaseStartedAt = performance.now()
    try {
      return await auth.handler(buildRequest())
    } finally {
      recordRequestPhase(event, 'oauth_better_auth', phaseStartedAt)
    }
  }

  try {
    // Only wrap authorization_code — pass refresh_token and others straight through.
    if (grantType !== 'authorization_code' || !code) {
      const res = await runAuthHandler()
      const responseBody = await res.text()
      logTokenExchange(tokenLogLevel(res.status), {
        ...requestFields,
        status: res.status,
        failed_phase: res.status >= 500 ? failedPhase : null,
        duration_ms: Date.now() - startedAt,
        ...requestMetricSummary(requestMetrics),
        ...tokenResponseSummary(responseBody),
      })
      return new Response(responseBody, { status: res.status, headers: res.headers })
    }

    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 90_000).toISOString()

    // Prune expired entries (best-effort, non-blocking on failure).
    const prunePromise = execute(
      cfEnv.DB,
      'DELETE FROM token_exchange_cache WHERE expires_at < ?',
      [now],
    ).catch(() => null)
    if (waitUntil) waitUntil(prunePromise)
    else void prunePromise

    // Atomic claim via INSERT OR IGNORE. First concurrent request wins (changes = 1).
    failedPhase = 'idempotency_claim'
    const claimStartedAt = performance.now()
    let insertResult: Awaited<ReturnType<typeof execute>>
    try {
      insertResult = await execute(
        cfEnv.DB,
        `INSERT OR IGNORE INTO token_exchange_cache (code, state, response_body, http_status, created_at, expires_at)
         VALUES (?, 'pending', '', 0, ?, ?)`,
        [code, now, expiresAt],
      )
    } finally {
      recordRequestPhase(event, 'oauth_idempotency_claim', claimStartedAt)
    }

    const claimed = Number(insertResult.meta.changes ?? 0) === 1

    if (!claimed) {
      failedPhase = 'idempotency_wait'
      const waitStartedAt = performance.now()
      let cachedResponse: Response | null = null
      // A concurrent request already claimed this code. Poll for its result.
      try {
        for (let i = 0; i < 12; i++) {
          if (i > 0) await new Promise(r => setTimeout(r, 250))
          const cached = await queryFirst<{ response_body: string; http_status: number }>(
            cfEnv.DB,
            `SELECT response_body, http_status FROM token_exchange_cache WHERE code = ? AND state = 'done'`,
            [code],
          )
          if (cached) {
            logTokenExchange(tokenLogLevel(cached.http_status), {
              ...requestFields,
              status: cached.http_status,
              failed_phase: null,
              duration_ms: Date.now() - startedAt,
              idempotency_cache: 'hit',
              ...requestMetricSummary(requestMetrics),
              ...tokenResponseSummary(cached.response_body),
            })
            cachedResponse = new Response(cached.response_body, {
              status: cached.http_status,
              headers: { 'Content-Type': 'application/json' },
            })
            break
          }
        }
      } finally {
        recordRequestPhase(event, 'oauth_idempotency_wait', waitStartedAt)
      }
      if (cachedResponse) return cachedResponse
      // Timed out waiting — fall through and try directly (primary may have failed).
      console.error('[Token] idempotency wait timed out, attempting direct exchange')
    }

    // Exchange the code with better-auth.
    const res = await runAuthHandler()
    const responseBody = await res.text()

    logTokenExchange(tokenLogLevel(res.status), {
      ...requestFields,
      status: res.status,
      failed_phase: res.status >= 500 ? failedPhase : null,
      duration_ms: Date.now() - startedAt,
      idempotency_cache: claimed ? 'miss' : 'timeout',
      ...requestMetricSummary(requestMetrics),
      ...tokenResponseSummary(responseBody),
    })

    // Persist result so concurrent duplicates can use it.
    failedPhase = 'idempotency_store'
    const storeStartedAt = performance.now()
    try {
      await execute(
        cfEnv.DB,
        `UPDATE token_exchange_cache SET state = 'done', response_body = ?, http_status = ? WHERE code = ?`,
        [responseBody, res.status, code],
      ).catch(err =>
        console.error('[Token] failed to store exchange result:', err)
      )
    } finally {
      recordRequestPhase(event, 'oauth_idempotency_store', storeStartedAt)
    }

    return new Response(responseBody, { status: res.status, headers: res.headers })
  } catch (error) {
    try {
      console.error('[OAUTH_TOKEN]', JSON.stringify({
        event: 'token_exchange_failed',
        ...requestFields,
        status: 500,
        duration_ms: Date.now() - startedAt,
        failed_phase: failedPhase,
        ...requestMetricSummary(requestMetrics),
        error_chain: errorChainForTelemetry(error),
      }))
    } catch {
      // Telemetry must never replace the token exchange error.
    }
    throw error
  }
})

function requestMetricSummary(metrics: ReturnType<typeof getRequestDataMetrics>) {
  return {
    statement_count: metrics.statementCount,
    d1_duration_ms: Number(metrics.d1DurationMs.toFixed(2)),
    phase_timings_ms: Object.fromEntries(
      Object.entries(metrics.phases).map(([name, duration]) => [name, Number(duration.toFixed(2))]),
    ),
  }
}

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

function tokenLogLevel(status: number): 'info' | 'warn' | 'error' {
  if (status >= 500) return 'error'
  if (status >= 400) return 'warn'
  return 'info'
}

function logTokenExchange(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>) {
  const status = typeof fields.status === 'number' ? fields.status : 0
  console[level]('[OAUTH_TOKEN]', JSON.stringify({
    event: status >= 500 ? 'token_exchange_failed' : 'token_exchange',
    ...fields,
  }))
}
