// POST /api/dashboard/legal/connect
//
// Starts (or resumes) a Blawby Connect onboarding flow (LegalOperation
// 'connect', BlawbyRouteKey 'connectStart' — PLACEHOLDER path
// '/legal/connect/onboard', see blawby-client.ts).
//
// *** KNOWN ARCHITECTURAL MISMATCH — DO NOT TREAT THIS ROUTE AS WORKING ***
// U9 reconciliation (task-u8-reconciliation-brief.md section 3, read
// directly from blawby-ts's real Connect route files) found that this
// route's entire model — one call, returning a hosted-onboarding redirect
// URL the browser is sent to — does NOT match what U8 actually exposes.
// Real U8 has FOUR separate Connect endpoints (`POST
// /connect/connected-accounts`, `GET /connect/status`, `POST
// /connect/account-session`, `GET /connect/account`), and NONE of them
// return a redirect URL: `POST /connect/account-session` creates an
// EMBEDDED Stripe Account Session (a client_secret meant to be consumed by
// Stripe.js on the frontend as an embedded component), not a
// hosted-onboarding link. This is a real product/frontend-architecture
// decision, not a path-string fix, and is explicitly OUT OF SCOPE for this
// task — implementing a redesign here without product/frontend sign-off
// risks shipping a second wrong assumption on top of the first. This route
// is left exactly as it was (still calling the old placeholder path/shape)
// and does NOT work against real U8; see
// task-u8-reconciliation-report.md for the full findings and
// recommendation. Do not build on top of this route until that decision is
// made.
//
// R22: callback URLs are built server-side from
// LEGAL_BLAWBY_CALLBACK_URL_RETURN/LEGAL_BLAWBY_CALLBACK_URL_REFRESH (U1's
// CloudflareEnv fields) — never from readBody/getQuery. Both values are
// validated by legal-access.ts's validateLegalCallbackUrl (exact HTTPS,
// no userinfo, no fragment) before being forwarded to Blawby; a value that
// fails validation is treated as a misconfiguration (503), same as a
// missing value, rather than forwarded as-is. This validation runs AFTER
// resolveLegalStaffAccess (auth/authz) — an unauthenticated or
// unauthorized caller must never be able to learn whether callback URLs
// are configured (CWE-209 information disclosure), so callback-URL
// validation is deliberately not performed until the caller is known to
// be an authorized staff actor.
// Plan step 6 / R14: the browser must create-and-retain an
// organization-scoped Connect UUID v4 in sessionStorage BEFORE calling this
// route and send it as `requestKey`; this route validates its shape and
// forwards it
// verbatim as callBlawbyRoute's requestReference so U8's organization-bound
// recovery record can resume the same operation after a response-loss
// retry — KrabiClaw itself keeps no separate Connect-recovery row (KTD10).
// R30: the returned onboarding URL is parsed and validated against a
// reviewed Stripe payment-origin allowlist before being returned to the
// browser; anything else is an invalid upstream response (502).

import { apiErrorResponse, cloudflareEnv, rethrowHttpError } from '~/server/utils/api-response'
import { callBlawbyRoute } from '~/server/utils/blawby-client'
import {
  assertLegalStaffMutationOrigin,
  legalJsonResponse,
  legalRequestCorrelationId,
  resolveLegalStaffAccess,
  validateLegalCallbackUrl,
} from '~/server/utils/legal-access'

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// PLACEHOLDER allowlist — Stripe Connect's real onboarding-link host(s) for
// this environment are not yet confirmed against U8/U10. Flagged in the U5
// report; must be reviewed before this is treated as a verified boundary.
const STRIPE_ONBOARDING_ORIGIN_ALLOWLIST = new Set(['https://connect.stripe.com'])

interface ConnectOnboardingResult {
  onboardingUrl: string
}

function parseConnectOnboardingResult(body: unknown): { onboardingUrl: string } | undefined {
  if (!body || typeof body !== 'object') return undefined
  const record = body as Record<string, unknown>
  return typeof record.onboardingUrl === 'string' ? { onboardingUrl: record.onboardingUrl } : undefined
}

// R30: HTTPS parsing + exact-origin allowlist check. A malformed URL or an
// origin outside the reviewed allowlist is an invalid upstream response,
// never silently passed through.
function validateOnboardingUrl(raw: string, correlationId: string): string {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new HTTPError({
      statusCode: 502,
      statusMessage: 'Blawby returned a malformed onboarding URL',
      data: { code: 'LEGAL_CONNECT_URL_INVALID', requestCorrelationId: correlationId },
    })
  }
  if (parsed.protocol !== 'https:' || !STRIPE_ONBOARDING_ORIGIN_ALLOWLIST.has(parsed.origin)) {
    throw new HTTPError({
      statusCode: 502,
      statusMessage: 'Blawby returned an onboarding URL outside the reviewed payment-origin allowlist',
      data: { code: 'LEGAL_CONNECT_URL_UNTRUSTED_ORIGIN', requestCorrelationId: correlationId },
    })
  }
  return parsed.toString()
}

export default defineHandler(async (event) => {
  const correlationId = legalRequestCorrelationId(event)
  const env = cloudflareEnv(event)
  assertLegalStaffMutationOrigin(event, env)

  try {
    const body = await readBody(event).catch(() => null) as { requestKey?: unknown } | null
    const requestKey = typeof body?.requestKey === 'string' ? body.requestKey.trim() : ''
    if (!UUID_V4_PATTERN.test(requestKey)) {
      return apiErrorResponse(event, 400, 'LEGAL_CONNECT_REQUEST_KEY_INVALID', 'A valid Connect request key (UUID v4) is required')
    }

    // Authentication/authorization MUST run before any check whose failure
    // mode discloses server configuration state (CWE-209) — an
    // unauthenticated caller must never learn whether Connect callback URLs
    // are configured. Origin validation (assertLegalStaffMutationOrigin)
    // stays first per this repo's R26 pattern; callback-URL validation is
    // deferred until after resolveLegalStaffAccess below.
    const access = await resolveLegalStaffAccess(event, 'connect', { pathname: '/api/dashboard/legal/connect' })

    const rawReturnUrl = typeof env.LEGAL_BLAWBY_CALLBACK_URL_RETURN === 'string' ? env.LEGAL_BLAWBY_CALLBACK_URL_RETURN : ''
    const rawRefreshUrl = typeof env.LEGAL_BLAWBY_CALLBACK_URL_REFRESH === 'string' ? env.LEGAL_BLAWBY_CALLBACK_URL_REFRESH : ''
    const returnUrl = validateLegalCallbackUrl(rawReturnUrl)
    const refreshUrl = validateLegalCallbackUrl(rawRefreshUrl)
    if (!returnUrl || !refreshUrl) {
      // R22: fail closed on a missing OR malformed/insecure callback URL —
      // never forward an unvalidated value to Blawby.
      return apiErrorResponse(event, 503, 'LEGAL_BLAWBY_NOT_CONFIGURED', 'Connect callback URLs are not configured for this environment')
    }

    const result = await callBlawbyRoute<ConnectOnboardingResult>(access.env, {
      routeKey: 'connectStart',
      scope: 'legal:connect',
      method: 'POST',
      identity: { organizationId: access.organizationId, actorId: access.userId, actorKind: 'human' },
      correlationId,
      // The Connect UUID is forwarded ONLY as requestReference (U8's
      // recovery-key mechanism), never as a body field the browser could
      // otherwise smuggle other values through.
      requestReference: requestKey,
      body: { returnUrl, refreshUrl },
      parseResponse: parseConnectOnboardingResult,
    })

    const onboardingUrl = validateOnboardingUrl(result.onboardingUrl, correlationId)
    return legalJsonResponse({ onboardingUrl })
  } catch (error) {
    rethrowHttpError(error)
    return apiErrorResponse(event, 500, 'LEGAL_CONNECT_START_FAILED', 'Failed to start the Connect onboarding flow')
  }
})

import { defineHandler, HTTPError } from 'nitro';
import { readBody } from 'nitro/h3';
