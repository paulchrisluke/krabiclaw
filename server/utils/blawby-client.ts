// Server-only transport for KrabiClaw's Blawby legal-facade backend (U8).
//
// Owns exactly what KTD1 assigns to this file: OAuth client_credentials token
// exchange with scoped cache + coalescing, a pinned-origin fetch wrapper with
// timeout and rejected redirects, a fresh outbound header allowlist, runtime
// response validation, and upstream error classification (R2-R7, R23-R25,
// R28-R29). It does not own route eligibility, flags, or domain workflows —
// callers (U3/U5/U6) decide whether a call is allowed before reaching here.
//
// U9 reconciliation (task-u8-reconciliation-brief.md) replaced the U2-U6
// placeholder route table below with U8's REAL, verified contract, read
// directly from blawby-ts (repo `blawby-backend`) source:
//   - Token endpoint: `${LEGAL_BLAWBY_ORIGIN}/api/auth/oauth2/token` (Better
//     Auth's OAuth2 plugin convention, mounted off the Better Auth issuer
//     `/api/auth`, NOT under the facade mount path and NOT `/oauth/token`).
//   - Facade mount path: `/api/integrations/krabiclaw/v1`
//     (blawby-ts src/modules/krabiclaw-integration/config/mount-path.ts:9).
//     Every BLAWBY_BEARER_ROUTES path below is `${BLAWBY_FACADE_MOUNT}${...}`.
//   - Machine-auth discriminator: `WWW-Authenticate: Bearer
//     realm="krabiclaw-facade", error="invalid_token"` (header check, as
//     before) OR a JSON body `{ error: { code: 'invalid_token', ... } }` --
//     `error` is an OBJECT with a `code` field, not a plain string (fixed
//     below in isMachineAuthFailure).
//
// ONE remaining unresolved item, deliberately NOT implemented here per the
// brief's explicit instruction (section 3): Connect. KrabiClaw's
// `connectStart`/`connect/index.post.ts` models Connect as one call
// returning a hosted-onboarding redirect URL. Real U8 exposes four separate
// Connect endpoints (`POST /connect/connected-accounts`, `GET
// /connect/status`, `POST /connect/account-session`, `GET /connect/account`)
// and none of them return a redirect URL -- `POST /connect/account-session`
// creates an EMBEDDED Stripe Account Session (a client_secret consumed by
// Stripe.js on the frontend), not a hosted-redirect URL. This is a real
// product/frontend-architecture mismatch, not a path-string fix -- see
// connect/index.post.ts's own comment and task-u8-reconciliation-report.md
// for the full analysis/recommendation. `connectStart`'s path below is left
// as its old U5 placeholder on purpose; it does not work against real U8.

import { HTTPError } from 'nitro'
import type { CloudflareEnv } from '~/server/utils/auth'
import { isRecord, readNumber, readString } from '~/server/utils/type-guards'

export interface BlawbyTrustedIdentity {
  organizationId: string
  actorId: string
  actorKind: string
}

// -- Config -------------------------------------------------------------

type RequiredConfigKey =
  | 'LEGAL_BLAWBY_ORIGIN'
  | 'LEGAL_BLAWBY_CLIENT_ID'
  | 'LEGAL_BLAWBY_CLIENT_SECRET'
  | 'LEGAL_BLAWBY_AUDIENCE'

function requireConfig(env: CloudflareEnv, key: RequiredConfigKey): string {
  const value = env[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new HTTPError({
      statusCode: 503,
      statusMessage: 'Blawby is not configured for this environment',
      data: { code: 'BLAWBY_NOT_CONFIGURED', field: key },
    })
  }
  return value
}

// No `??`/`||` default: a missing or invalid timeout blocks any real call
// (fail closed) rather than silently allowing an unbounded fetch.
function resolveTimeoutMs(env: CloudflareEnv, correlationId: string): number {
  const raw = env.LEGAL_BLAWBY_TIMEOUT_MS
  const parsed = typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HTTPError({
      statusCode: 503,
      statusMessage: 'Blawby request timeout is not configured',
      data: { code: 'BLAWBY_NOT_CONFIGURED', field: 'LEGAL_BLAWBY_TIMEOUT_MS', requestCorrelationId: correlationId },
    })
  }
  return parsed
}

function resolvePinnedOrigin(env: CloudflareEnv, correlationId: string): URL {
  const raw = requireConfig(env, 'LEGAL_BLAWBY_ORIGIN')
  let origin: URL
  try {
    origin = new URL(raw)
  } catch {
    throw new HTTPError({
      statusCode: 503,
      statusMessage: 'Blawby origin is not a valid URL',
      data: { code: 'BLAWBY_NOT_CONFIGURED', field: 'LEGAL_BLAWBY_ORIGIN', requestCorrelationId: correlationId },
    })
  }
  if (
    origin.protocol !== 'https:'
    || origin.username
    || origin.password
    || origin.hash
    || origin.search
    || (origin.pathname !== '/' && origin.pathname !== '')
  ) {
    throw new HTTPError({
      statusCode: 503,
      statusMessage: 'Blawby origin must be a bare HTTPS origin',
      data: { code: 'BLAWBY_NOT_CONFIGURED', field: 'LEGAL_BLAWBY_ORIGIN', requestCorrelationId: correlationId },
    })
  }
  return origin
}

// Static route paths only — never accepts a path from a caller argument.
// Only relative paths matching this allowlist may be requested; combined
// with the origin-match assertion in buildBlawbyUrl this rejects absolute
// overrides, scheme-relative overrides, encoded host escapes, userinfo, and
// fragments even if a future edit to this file introduced a bad literal.
// This is checked AFTER any `{param}` placeholder has already been
// interpolated (see interpolatePathParam below) — a resolved path never
// contains `{`/`}`, so this pattern does not need to allow them.
const SAFE_PATH_PATTERN = /^\/[A-Za-z0-9/_-]+$/

// A single interpolated path segment (UUID, request-reference UUID, or
// contract id) — no `/`, no `{`/`}`, no other characters that could alter
// the route shape once substituted into the path template.
const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/

// Better Auth's OAuth2 plugin issuer is `${LEGAL_BLAWBY_ORIGIN}/api/auth`
// (blawby-ts src/modules/krabiclaw-integration/middleware/verify-facade-token.ts:65);
// its OAuth2 provider mounts the client_credentials token grant at
// `/api/auth/oauth2/token` off that issuer — NOT under the facade mount path.
const BLAWBY_TOKEN_PATH = '/api/auth/oauth2/token'

// blawby-ts src/modules/krabiclaw-integration/config/mount-path.ts:9.
const BLAWBY_FACADE_MOUNT = '/api/integrations/krabiclaw/v1'

interface BlawbyRouteDescriptor {
  /** May contain exactly one `{param}` placeholder, substituted by callBlawbyRoute's `pathParam`. */
  path: string
  includeClientIp: boolean
}

// Real U8 route table (task-u8-reconciliation-brief.md section 1-2), read
// directly from blawby-ts's route files under
// src/modules/krabiclaw-integration/routes/{practice,connect,intakes,
// engagement-contracts}.routes.ts. All paths are relative to
// BLAWBY_FACADE_MOUNT, prefixed below.
//
// `intakeAccept` and `engagementAcceptance` map to real U8 routes that are
// general status-action dispatchers (`accepted`/`declined`/`send`), not
// accept-only, despite their KrabiClaw route-key names. KrabiClaw's own
// route files (intakes/[intakeId]/accept.post.ts,
// engagement-contracts/[contractId]/accept.post.ts) only ever send the
// 'accepted' branch of that dispatch — decline/send are NOT implemented by
// this task; see task-u8-reconciliation-report.md's scope-decision section.
//
// connectStart is UNCHANGED (still the old U5 placeholder path) — Connect
// is explicitly out of scope for this task; see the file-header comment
// above and connect/index.post.ts.
//
// R5 scopes the dedicated originating-client-IP forward to engagement
// acceptance ONLY (confirmed by U8's own `acceptsOriginatingClientIp: true`
// on PATCH /engagement-contracts/{contract_id}/status, read on the
// 'accepted' branch server-side only). Every other route omits client IP.
const BLAWBY_BEARER_ROUTES = {
  practiceRead: { path: `${BLAWBY_FACADE_MOUNT}/practice/details`, includeClientIp: false },
  practiceMutate: { path: `${BLAWBY_FACADE_MOUNT}/practice/details`, includeClientIp: false },
  intakeList: { path: `${BLAWBY_FACADE_MOUNT}/intakes`, includeClientIp: false },
  intakeAccept: { path: `${BLAWBY_FACADE_MOUNT}/intakes/{uuid}/triage`, includeClientIp: false },
  engagementContractsList: { path: `${BLAWBY_FACADE_MOUNT}/engagement-contracts`, includeClientIp: false },
  engagementAcceptance: { path: `${BLAWBY_FACADE_MOUNT}/engagement-contracts/{contract_id}/status`, includeClientIp: true },
  intakeCreate: { path: `${BLAWBY_FACADE_MOUNT}/intakes`, includeClientIp: false },
  intakeRecover: { path: `${BLAWBY_FACADE_MOUNT}/intakes/requests/{request_id}`, includeClientIp: false },
  intakeCheckout: { path: `${BLAWBY_FACADE_MOUNT}/intakes/{uuid}/checkout-session`, includeClientIp: false },
  intakeStatus: { path: `${BLAWBY_FACADE_MOUNT}/intakes/{uuid}/status`, includeClientIp: false },
  intakePostPay: { path: `${BLAWBY_FACADE_MOUNT}/intakes/{uuid}/post-pay/status`, includeClientIp: false },
  // Out of scope (section 3) — unchanged U5 placeholder, does not work
  // against real U8. See file-header comment.
  connectStart: { path: '/legal/connect/onboard', includeClientIp: false },
} as const satisfies Record<string, BlawbyRouteDescriptor>

export type BlawbyRouteKey = keyof typeof BLAWBY_BEARER_ROUTES

// Substitutes a route template's single `{param}` placeholder (if any) with
// a caller-supplied, validated path segment. Never accepts an arbitrary path
// from a caller — only a bare segment value, checked against
// SAFE_PATH_SEGMENT_PATTERN, which is then interpolated into the static
// template already defined above.
function interpolatePathParam(pathTemplate: string, pathParam: string | undefined, correlationId: string): string {
  const hasPlaceholder = /\{[^}]+\}/.test(pathTemplate)
  if (!hasPlaceholder) return pathTemplate
  if (!pathParam || !SAFE_PATH_SEGMENT_PATTERN.test(pathParam)) {
    throw new HTTPError({
      statusCode: 500,
      statusMessage: 'Blawby route path parameter is missing or invalid',
      data: { code: 'BLAWBY_INVALID_PATH_PARAM', requestCorrelationId: correlationId },
    })
  }
  return pathTemplate.replace(/\{[^}]+\}/, encodeURIComponent(pathParam))
}

function buildBlawbyUrl(origin: URL, path: string, correlationId: string): URL {
  if (!SAFE_PATH_PATTERN.test(path)) {
    throw new HTTPError({
      statusCode: 502,
      statusMessage: 'Blawby route path is invalid',
      data: { code: 'BLAWBY_INVALID_ROUTE', requestCorrelationId: correlationId },
    })
  }
  const url = new URL(path, origin)
  if (url.origin !== origin.origin || url.username || url.password || url.hash) {
    throw new HTTPError({
      statusCode: 502,
      statusMessage: 'Blawby route path escaped the pinned origin',
      data: { code: 'BLAWBY_ORIGIN_ESCAPE', requestCorrelationId: correlationId },
    })
  }
  return url
}

// -- Fresh outbound header allowlist (R5-R6) -----------------------------
//
// Every header here is built from explicit parameters only. This function
// never receives or reads an inbound Request/Headers object, so browser
// cookies, forwarding headers, `Authorization`, and inbound `x-krabiclaw-*`
// values cannot reach it by construction — there is nothing to filter out.

function buildOutboundHeaders(params: {
  contentType?: string
  authorization?: string
  identity?: BlawbyTrustedIdentity
  requestReference?: string
  clientIp?: string
}): Headers {
  const headers = new Headers()
  if (params.contentType) headers.set('content-type', params.contentType)
  if (params.authorization) headers.set('authorization', params.authorization)
  if (params.identity) {
    headers.set('x-krabiclaw-organization-id', params.identity.organizationId)
    headers.set('x-krabiclaw-actor-id', params.identity.actorId)
    headers.set('x-krabiclaw-actor-kind', params.identity.actorKind)
  }
  if (params.requestReference) headers.set('x-krabiclaw-request-reference', params.requestReference)
  // x-krabiclaw-correlation-id (KrabiClaw's own internal logging id) is
  // deliberately NOT forwarded to U8 — it is not part of U8's documented
  // header schema (task-u8-reconciliation-brief.md section 1); dropped
  // rather than sent speculatively.
  if (params.clientIp) headers.set('x-krabiclaw-originating-client-ip', params.clientIp)
  return headers
}

// -- Low-level pinned-origin fetch (R4) ----------------------------------

interface BlawbyRawResponse {
  status: number
  body: unknown
  wwwAuthenticate: string | null
}

async function fetchBlawby(params: {
  env: CloudflareEnv
  path: string
  method: 'GET' | 'POST' | 'PATCH'
  headers: Headers
  body?: string
  correlationId: string
  /** Appended as URL-encoded query params after the pinned-origin path is built. */
  query?: Record<string, string>
}): Promise<BlawbyRawResponse> {
  const origin = resolvePinnedOrigin(params.env, params.correlationId)
  const url = buildBlawbyUrl(origin, params.path, params.correlationId)
  if (params.query) {
    for (const [key, value] of Object.entries(params.query)) {
      url.searchParams.set(key, value)
    }
  }
  const timeoutMs = resolveTimeoutMs(params.env, params.correlationId)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  // The whole request/response cycle — including the body read below — must
  // stay bounded by timeoutMs, not just the header phase: fetch() resolves
  // as soon as headers arrive, so a slow/stalled body would otherwise be
  // read with no timeout at all. The timer is therefore cleared only once,
  // in this outer finally, after response.json() has settled either way.
  try {
    let response: Response
    try {
      response = await fetch(url, {
        method: params.method,
        headers: params.headers,
        body: params.body,
        redirect: 'manual',
        signal: controller.signal,
      })
    } catch (error) {
      // Exactly one attempt: network errors and timeouts are never retried
      // here (KTD6) — the caller decides whether a higher-level replay
      // applies.
      const isAbort = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')
      throw new HTTPError({
        statusCode: 503,
        statusMessage: isAbort ? 'Blawby request timed out' : 'Blawby request failed',
        data: {
          code: isAbort ? 'BLAWBY_TIMEOUT' : 'BLAWBY_UNAVAILABLE',
          requestCorrelationId: params.correlationId,
        },
      })
    }

    // Rejected redirects: `redirect: 'manual'` never follows automatically;
    // any 3xx (or an opaque redirect result) is a classified failure, not a
    // second request, so no credential is ever sent to a redirect target.
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new HTTPError({
        statusCode: 502,
        statusMessage: 'Blawby returned a redirect',
        data: { code: 'BLAWBY_REDIRECT_REJECTED', requestCorrelationId: params.correlationId },
      })
    }

    if (response.status >= 500) {
      throw new HTTPError({
        statusCode: 503,
        statusMessage: 'Blawby is unavailable',
        data: { code: 'BLAWBY_UPSTREAM_UNAVAILABLE', requestCorrelationId: params.correlationId },
      })
    }

    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      // A body-read that fails because the controller aborted (the timeout
      // fired while reading the body, not just the header phase) is the
      // SAME timeout condition as the header-phase abort above, and must be
      // classified identically (503 BLAWBY_TIMEOUT) — not misreported as a
      // generic malformed-response error. A parse failure that is NOT an
      // abort keeps its existing classification (502 malformed response).
      const isAbort = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')
      if (isAbort) {
        throw new HTTPError({
          statusCode: 503,
          statusMessage: 'Blawby request timed out',
          data: { code: 'BLAWBY_TIMEOUT', requestCorrelationId: params.correlationId },
        })
      }
      throw new HTTPError({
        statusCode: 502,
        statusMessage: 'Blawby returned a malformed response',
        data: { code: 'BLAWBY_MALFORMED_RESPONSE', requestCorrelationId: params.correlationId },
      })
    }

    return {
      status: response.status,
      body,
      wwwAuthenticate: response.headers.get('www-authenticate'),
    }
  } finally {
    clearTimeout(timer)
  }
}

// -- Token exchange, scoped cache + coalescing (R2-R3) -------------------

interface TokenCacheEntry {
  token: string
  expiresAt: number
  inflight?: Promise<string>
}

// Isolate-local cache: tokens are short-lived credentials, and only requests
// within one isolate need coalescing (see plan Risks and Dependencies).
const tokenCache = new Map<string, TokenCacheEntry>()

const TOKEN_RENEWAL_SKEW_MS = 60_000

function tokenCacheKey(scope: string, audience: string): string {
  return `${scope}::${audience}`
}

function encodeBasicAuth(clientId: string, clientSecret: string): string {
  return btoa(`${clientId}:${clientSecret}`)
}

interface ParsedTokenResponse {
  accessToken: string
  expiresIn: number
}

function parseTokenResponse(body: unknown): ParsedTokenResponse | undefined {
  if (!isRecord(body)) return undefined
  const accessToken = readString(body, 'access_token')
  const expiresIn = readNumber(body, 'expires_in')
  const tokenType = readString(body, 'token_type')
  if (!accessToken || !expiresIn || expiresIn <= 0) return undefined
  if (!tokenType || tokenType.toLowerCase() !== 'bearer') return undefined
  return { accessToken, expiresIn }
}

async function requestFreshToken(
  env: CloudflareEnv,
  scope: string,
  audience: string,
  correlationId: string,
): Promise<{ token: string, expiresAt: number }> {
  const clientId = requireConfig(env, 'LEGAL_BLAWBY_CLIENT_ID')
  const clientSecret = requireConfig(env, 'LEGAL_BLAWBY_CLIENT_SECRET')
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    resource: audience,
    scope,
  }).toString()
  const headers = buildOutboundHeaders({
    contentType: 'application/x-www-form-urlencoded',
    authorization: `Basic ${encodeBasicAuth(clientId, clientSecret)}`,
  })

  const result = await fetchBlawby({ env, path: BLAWBY_TOKEN_PATH, method: 'POST', headers, body, correlationId })

  if (result.status !== 200) {
    throw new HTTPError({
      statusCode: 502,
      statusMessage: 'Blawby token exchange failed',
      data: { code: 'BLAWBY_TOKEN_EXCHANGE_FAILED', requestCorrelationId: correlationId },
    })
  }

  const parsed = parseTokenResponse(result.body)
  if (!parsed) {
    throw new HTTPError({
      statusCode: 502,
      statusMessage: 'Blawby token response did not match the expected contract',
      data: { code: 'BLAWBY_TOKEN_RESPONSE_INVALID', requestCorrelationId: correlationId },
    })
  }

  return { token: parsed.accessToken, expiresAt: Date.now() + parsed.expiresIn * 1000 }
}

// Concurrent callers for one scope perform exactly one token exchange
// (R3, AE4): the cache-check and inflight-promise registration below run
// synchronously (no `await` before the `tokenCache.set` that publishes the
// inflight promise), so a burst of same-tick callers all observe the same
// promise instead of racing separate exchanges.
function getCachedOrFreshToken(
  env: CloudflareEnv,
  scope: string,
  correlationId: string,
  forceRefresh: boolean,
): Promise<string> {
  if (!scope || /\s/.test(scope)) {
    throw new HTTPError({
      statusCode: 500,
      statusMessage: 'Blawby scope must be a single non-empty scope string',
      data: { code: 'BLAWBY_INVALID_SCOPE', requestCorrelationId: correlationId },
    })
  }

  const audience = requireConfig(env, 'LEGAL_BLAWBY_AUDIENCE')
  const key = tokenCacheKey(scope, audience)
  const now = Date.now()
  const entry = tokenCache.get(key)

  // U9 reconciliation (task-u8-reconciliation-brief.md section 5b): join an
  // already-in-progress refresh for this key BEFORE any deletion, and
  // regardless of forceRefresh. The old ordering deleted+forgot the entry
  // whenever forceRefresh was true without first checking entry.inflight, so
  // two callers hitting invalid_token for the same scope in the same tick
  // would each delete the other's just-registered inflight refresh and start
  // a duplicate token exchange -- exactly the coalescing R3 requires ("only
  // U8's stable machine-auth discriminator may clear and refresh the token
  // once") but did not actually provide under this race.
  if (entry?.inflight) {
    return entry.inflight
  }

  if (forceRefresh && entry) {
    tokenCache.delete(key)
  }

  const current = forceRefresh ? undefined : entry

  if (!forceRefresh && current && current.expiresAt - TOKEN_RENEWAL_SKEW_MS > now) {
    return Promise.resolve(current.token)
  }

  const inflight: Promise<string> = requestFreshToken(env, scope, audience, correlationId)
    .then((result) => {
      tokenCache.set(key, { token: result.token, expiresAt: result.expiresAt })
      return result.token
    })
    .catch((error: unknown) => {
      tokenCache.delete(key)
      throw error
    })

  tokenCache.set(key, { token: current?.token ?? '', expiresAt: current?.expiresAt ?? 0, inflight })
  return inflight
}

export async function getBlawbyServiceToken(
  env: CloudflareEnv,
  scope: string,
  correlationId: string,
): Promise<string> {
  return getCachedOrFreshToken(env, scope, correlationId, false)
}

// -- Machine-auth discriminator + bounded refresh-and-replay (R3, F3) ----

function isMachineAuthFailure(result: BlawbyRawResponse): boolean {
  if (result.status !== 401) return false
  if (result.wwwAuthenticate && /invalid_token/i.test(result.wwwAuthenticate)) return true
  // U8's real body shape is `{ error: { code: 'invalid_token', message }
  // }` -- `error` is an OBJECT with a `code` field, not a plain string (the
  // old `readString(result.body, 'error') === 'invalid_token'` check
  // expected the wrong shape and could never match a real response; this is
  // defense-in-depth alongside the WWW-Authenticate check above, which
  // remains the primary, already-correct signal).
  return isRecord(result.body) && isRecord(result.body.error) && readString(result.body.error, 'code') === 'invalid_token'
}

// -- Generic authenticated route dispatch (R2-R7, R23-R25, R28) ---------

export interface BlawbyRouteCallParams<TResponse> {
  routeKey: BlawbyRouteKey
  scope: string
  method: 'GET' | 'POST' | 'PATCH'
  identity: BlawbyTrustedIdentity
  correlationId: string
  requestReference?: string
  /**
   * A single path-segment value substituted into the route's `{param}`
   * placeholder (e.g. the Blawby intake UUID, the request reference, or the
   * contract id — see BLAWBY_BEARER_ROUTES). Required when the route's path
   * template contains a placeholder; ignored otherwise. Never accepted from
   * a caller as a raw path — always validated against
   * SAFE_PATH_SEGMENT_PATTERN before interpolation.
   */
  pathParam?: string
  /**
   * URL-encoded query parameters appended to the request (e.g. U8's real
   * `GET /intakes/{uuid}/post-pay/status` route, which requires a
   * `session_id` query param per
   * `checkoutSessionStatusQuerySchema` in blawby-ts
   * src/modules/practice-client-intakes/validations/practice-client-intakes.validation.ts:80-82).
   * Sent as-is, never merged with any inbound query string.
   */
  query?: Record<string, string>
  clientIp?: string
  body?: unknown
  /** Runtime-validate a successful (2xx) response body. Return undefined on mismatch. */
  parseResponse: (body: unknown) => TResponse | undefined
  /**
   * Runtime-validate a reviewed route-family 4xx error contract (R28).
   * Only a successfully parsed known error is passed through with its real
   * status; every other 4xx — including a domain 401 this function does not
   * recognize as the machine-auth discriminator — is sanitized to 502.
   */
  parseKnownError?: (status: number, body: unknown) => Record<string, unknown> | undefined
}

export async function callBlawbyRoute<TResponse>(
  env: CloudflareEnv,
  params: BlawbyRouteCallParams<TResponse>,
): Promise<TResponse> {
  const route = BLAWBY_BEARER_ROUTES[params.routeKey]
  const serializedBody = params.body !== undefined ? JSON.stringify(params.body) : undefined
  // Path-param interpolation happens once, up front — not per-attempt — so
  // a refresh-and-replay never re-validates/re-derives the resolved path.
  const resolvedPath = interpolatePathParam(route.path, params.pathParam, params.correlationId)

  const attempt = async (forceRefresh: boolean): Promise<BlawbyRawResponse> => {
    const token = await getCachedOrFreshToken(env, params.scope, params.correlationId, forceRefresh)
    const headers = buildOutboundHeaders({
      contentType: serializedBody !== undefined ? 'application/json' : undefined,
      authorization: `Bearer ${token}`,
      identity: params.identity,
      requestReference: params.requestReference,
      // R5: the trusted client IP is only ever attached for the route(s)
      // flagged to carry it (engagement acceptance); every other route
      // omits it even if a caller passed one.
      clientIp: route.includeClientIp ? params.clientIp : undefined,
    })
    return fetchBlawby({
      env,
      path: resolvedPath,
      method: params.method,
      headers,
      body: serializedBody,
      correlationId: params.correlationId,
      query: params.query,
    })
  }

  let result = await attempt(false)

  // Exactly one discriminated machine-auth refresh-and-replay (KTD6, F3).
  // A domain 401 (not the discriminator) and a second discriminated failure
  // both fall through to classification below without a further retry.
  if (isMachineAuthFailure(result)) {
    result = await attempt(true)
    if (isMachineAuthFailure(result)) {
      throw new HTTPError({
        statusCode: 502,
        statusMessage: 'Blawby authentication failed after refresh',
        data: { code: 'BLAWBY_AUTH_REFRESH_FAILED', requestCorrelationId: params.correlationId },
      })
    }
  }

  if (result.status >= 200 && result.status < 300) {
    const parsed = params.parseResponse(result.body)
    if (parsed === undefined) {
      throw new HTTPError({
        statusCode: 502,
        statusMessage: 'Blawby response did not match the expected contract',
        data: { code: 'BLAWBY_RESPONSE_SCHEMA_MISMATCH', requestCorrelationId: params.correlationId },
      })
    }
    return parsed
  }

  // fetchBlawby already classified 3xx/5xx/network/timeout above this call,
  // so every remaining status here is a 4xx.
  const known = params.parseKnownError?.(result.status, result.body)
  if (known) {
    throw new HTTPError({
      statusCode: result.status,
      statusMessage: 'Blawby rejected the request',
      data: { ...known, requestCorrelationId: params.correlationId },
    })
  }
  throw new HTTPError({
    statusCode: 502,
    statusMessage: 'Blawby returned an unreviewed error response',
    data: { code: 'BLAWBY_UNREVIEWED_ERROR', requestCorrelationId: params.correlationId },
  })
}
