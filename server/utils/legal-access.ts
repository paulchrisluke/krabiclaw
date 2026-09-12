// Shared policy boundary for KrabiClaw's dormant legal (Blawby) routes (U9).
//
// Decides WHO may reach a legal route — staff via Better Auth organization
// membership, public via a verified Better Auth human or anonymous actor —
// by composing the existing session, membership, active-site, billing, and
// rollout-flag helpers. Per KTD2, it never reimplements auth/role/membership
// logic: staff org-wide access reuses assertOrganizationAccess verbatim,
// session/org/site resolution reuses getDashboardContext verbatim, and site
// eligibility reuses getActiveBlawbySite verbatim.
//
// Dormant in U3: no route imports this module yet. U5/U6 call
// resolveLegalStaffAccess and the public resolver trio below once the real
// legal routes land; U4's durable-claim conflict classifier calls
// emitLegalSecurityEvent for its own ownership/payload-conflict reasons.

import { HTTPError } from 'nitro'
import type { H3Event } from 'nitro'
import { appendResponseHeader } from 'nitro/h3'

import { queryFirst, type DbClient } from '~/server/db'
import { createAuth, getAuthSession, normalizeOrigin, type CloudflareEnv } from '~/server/utils/auth'
import { apiErrorResponse, cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { getDashboardContext } from '~/server/utils/dashboard-context'
import { assertOrganizationAccess } from '~/server/utils/member-access'
import { getActiveBlawbySite } from '~/server/utils/professional-services'
import { getOrganizationBillingProjection } from '~/server/utils/organization-billing'
import { getRequestDataMetrics } from '~/server/utils/request-metrics'
import {
  isLegalPracticeReadEnabled,
  isLegalPracticeMutationEnabled,
  isLegalConnectEnabled,
  isLegalIntakeWithoutPaymentEnabled,
  isLegalIntakePaymentEnabled,
  isLegalEngagementEnabled,
} from '~/server/utils/feature-flags'
import { getClientIp, hashClientIp, incrementHourlyRateLimit } from '~/server/utils/hourly-rate-limit'

// -- Operations & rollout flags ---------------------------------------------

// One entry per R9's six default-off rollout-group flags. Every legal route
// (staff or public) names exactly one of these; the shared resolvers below
// gate on it plus the site's effective legal_operations entitlement before
// any Blawby call.
export type LegalOperation =
  | 'practice_read'
  | 'practice_mutation'
  | 'connect'
  | 'intake_without_payment'
  | 'intake_payment'
  | 'engagement'

const LEGAL_OPERATION_FLAG: Record<LegalOperation, (env: CloudflareEnv) => boolean> = {
  practice_read: isLegalPracticeReadEnabled,
  practice_mutation: isLegalPracticeMutationEnabled,
  connect: isLegalConnectEnabled,
  intake_without_payment: isLegalIntakeWithoutPaymentEnabled,
  intake_payment: isLegalIntakePaymentEnabled,
  engagement: isLegalEngagementEnabled,
}

export function isLegalOperationEnabled(env: CloudflareEnv, operation: LegalOperation): boolean {
  return LEGAL_OPERATION_FLAG[operation](env)
}

// -- Actor kind ---------------------------------------------------------

// 'staff' identifies an owner/admin acting through the dashboard. 'human' and
// 'anonymous' identify a public Better Auth session, derived from Better
// Auth's own `isAnonymous` flag (R13) — KrabiClaw defines no parallel guest
// identity model. This union matches server/utils/blawby-client.ts's
// BlawbyTrustedIdentity.actorKind (a plain string there; this is its
// authoritative value set).
export type LegalActorKind = 'staff' | 'human' | 'anonymous'

// -- R29 structured security events ------------------------------------------

// Stable, non-secret denial reasons. U4's durable-claim conflict classifier
// and U5/U6 extend this set with their own reasons (e.g. ownership_conflict,
// payload_conflict) — the `(string & {})` branch keeps the type open to that
// without losing autocomplete for the reasons this module emits itself.
export type LegalSecurityEventReason =
  | 'session_required'
  | 'organization_access_required'
  | 'site_ineligible'
  | 'rollout_group_disabled'
  | 'entitlement_missing'
  | 'origin_unresolved'
  | 'origin_invalid'
  | 'ip_site_budget_exceeded'
  | 'actor_site_budget_exceeded'
  | 'site_budget_exceeded'
  | 'request_reference_budget_exceeded'
  | (string & {})

export interface LegalSecurityEventInput {
  reason: LegalSecurityEventReason
  organizationId: string | null
  siteId: string | null
  actorKind: LegalActorKind | null
  requestCorrelationId: string | null
}

// The single emission point R29 requires: eligibility denials, origin
// failures, rate-limit trips, request-reference ownership conflicts, and
// payload conflicts all funnel through this function. Never pass a token,
// payload, request reference (the R14 UUID value), session ID, or upstream
// body here — only the stable diagnostic fields R29 names.
//
// No existing structured-log/audit-event module exists in this repo
// (searched for `console.log(JSON.stringify` and similar before adding
// this) — a plain JSON console line is the minimal shape; Cloudflare
// Workers observability captures it without new infrastructure.
export function emitLegalSecurityEvent(input: LegalSecurityEventInput): void {
  console.log(JSON.stringify({
    event: 'legal_security_denial',
    reason: input.reason,
    organizationId: input.organizationId,
    siteId: input.siteId,
    actorKind: input.actorKind,
    requestCorrelationId: input.requestCorrelationId,
    ts: new Date().toISOString(),
  }))
}

// The request-correlation id (NOT the R14 request-reference UUID) every R29
// event carries. Reuses the same x-request-id convention api-response.ts's
// apiErrorResponse already surfaces to clients, memoized per event.
export function legalRequestCorrelationId(event: H3Event): string {
  return getRequestDataMetrics(event).requestId
}

function denyLegal(input: {
  event: H3Event
  reason: LegalSecurityEventReason
  organizationId: string | null
  siteId: string | null
  actorKind: LegalActorKind | null
  statusCode: number
  message: string
}): never {
  emitLegalSecurityEvent({
    reason: input.reason,
    organizationId: input.organizationId,
    siteId: input.siteId,
    actorKind: input.actorKind,
    requestCorrelationId: legalRequestCorrelationId(input.event),
  })
  throw new HTTPError({ statusCode: input.statusCode, message: input.message })
}

// -- Staff access ---------------------------------------------------------

export interface LegalStaffAccess {
  env: CloudflareEnv
  db: DbClient
  organizationId: string
  siteId: string
  userId: string
  role: string
}

export interface ResolveLegalStaffAccessOptions {
  organizationSlug?: string | null
  siteId?: string | null
  siteSlug?: string | null
  pathname?: string
}

// R9-R12: session + org membership + site resolution reuse
// getDashboardContext verbatim (never a parallel session/org/site lookup —
// its own 401/404s are the existing boundary, not re-wrapped here);
// owner/admin reuses assertOrganizationAccess verbatim (a site-wide editor
// is insufficient — R11); site eligibility reuses getActiveBlawbySite
// verbatim rather than comparing the raw stored vertical (R10); the rollout
// flag and the site's effective legal_operations entitlement gate every
// operation before token acquisition (R9, R12).
export async function resolveLegalStaffAccess(
  event: H3Event,
  operation: LegalOperation,
  options: ResolveLegalStaffAccessOptions = {},
  resolveEntitlement: LegalEntitlementResolver = defaultLegalEntitlementResolver,
): Promise<LegalStaffAccess> {
  const context = await getDashboardContext(event, {
    requireSite: true,
    requireOrganization: true,
    organizationSlug: options.organizationSlug,
    siteId: options.siteId,
    siteSlug: options.siteSlug,
    pathname: options.pathname,
  })
  const organizationId = context.organization.id
  const site = context.site
  if (!site) {
    // getDashboardContext({ requireSite: true }) already throws 404 before
    // returning a null site — this keeps the return type honest without an
    // unchecked cast rather than asserting it can never happen.
    denyLegal({
      event, reason: 'site_ineligible', organizationId, siteId: null, actorKind: 'staff',
      statusCode: 404, message: 'Site not found',
    })
  }

  try {
    assertOrganizationAccess(context.organization.role)
  } catch (error) {
    emitLegalSecurityEvent({
      reason: 'organization_access_required',
      organizationId,
      siteId: site.id,
      actorKind: 'staff',
      requestCorrelationId: legalRequestCorrelationId(event),
    })
    throw error
  }

  const activeSite = await getActiveBlawbySite(context.db, site.id)
  if (!activeSite) {
    denyLegal({
      event, reason: 'site_ineligible', organizationId, siteId: site.id, actorKind: 'staff',
      statusCode: 403, message: 'This site is not eligible for legal operations',
    })
  }

  if (!isLegalOperationEnabled(context.env, operation)) {
    denyLegal({
      event, reason: 'rollout_group_disabled', organizationId, siteId: site.id, actorKind: 'staff',
      statusCode: 403, message: 'Legal operations are not enabled for this deployment',
    })
  }

  const entitled = await resolveEntitlement(context.db, organizationId)
  if (!entitled) {
    denyLegal({
      event, reason: 'entitlement_missing', organizationId, siteId: site.id, actorKind: 'staff',
      statusCode: 403, message: 'Legal operations are not included in this organization’s plan',
    })
  }

  return {
    env: context.env,
    db: context.db,
    organizationId,
    siteId: site.id,
    userId: context.userId,
    role: context.organization.role,
  }
}

// -- Public access: origin --------------------------------------------------

async function resolveLegalSiteCanonicalOrigin(db: DbClient, siteId: string): Promise<string | null> {
  const row = await queryFirst<{ domain: string | null }>(db, `
    SELECT domain FROM site_domains
     WHERE site_id = ? AND role = 'canonical' AND status = 'active'
     LIMIT 1
  `, [siteId])
  if (!row?.domain) return null
  try {
    return new URL(`https://${row.domain}`).origin
  } catch {
    return null
  }
}

function requestOrigin(event: H3Event): string | null {
  const raw = event.req.headers.get('origin')
  if (!raw) return null
  try {
    return new URL(raw).origin
  } catch {
    return null
  }
}

// R13/R26's shared Origin-validation boundary. Compares the request's Origin
// header against the site's own canonical domain (never a static allowlist),
// so a public mutation is only accepted from the tenant's own site. Exported
// standalone (not only as part of resolveLegalPublicSiteAccess) because R26
// needs it from multiple public route families, not only the ones that also
// need the full site/flag/entitlement/budget resolution below.
export function validateLegalMutationOrigin(event: H3Event, canonicalOrigin: string): boolean {
  const origin = requestOrigin(event)
  return origin !== null && origin === canonicalOrigin
}

// -- Public access: budgets --------------------------------------------------

type LegalBudgetKind = 'ip_site_op' | 'actor_site_op' | 'site_op' | 'request_ref'

const LEGAL_BUDGET_ENV_KEYS: Record<LegalBudgetKind, { limit: keyof CloudflareEnv; window: keyof CloudflareEnv }> = {
  ip_site_op: { limit: 'LEGAL_PUBLIC_BUDGET_IP_SITE_OP_LIMIT', window: 'LEGAL_PUBLIC_BUDGET_IP_SITE_OP_WINDOW_MS' },
  actor_site_op: { limit: 'LEGAL_PUBLIC_BUDGET_ACTOR_SITE_OP_LIMIT', window: 'LEGAL_PUBLIC_BUDGET_ACTOR_SITE_OP_WINDOW_MS' },
  site_op: { limit: 'LEGAL_PUBLIC_BUDGET_SITE_OP_LIMIT', window: 'LEGAL_PUBLIC_BUDGET_SITE_OP_WINDOW_MS' },
  request_ref: { limit: 'LEGAL_PUBLIC_BUDGET_REQUEST_REF_LIMIT', window: 'LEGAL_PUBLIC_BUDGET_REQUEST_REF_WINDOW_MS' },
}

// R19: a missing, non-numeric, non-integer, or non-positive budget value
// denies — it never falls back to a hardcoded limit. Exported because it is
// pure isolated logic worth proving directly (testing-strategy.md item 2).
export function parseLegalBudgetPositiveInt(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

// R19's budget-key construction: `legal:{operation}:{dimension}:{...}`, one
// independent key per budget dimension so a rotated IP/actor/request
// reference never shares a bucket with another. Exported for the same
// direct-unit-test reason as parseLegalBudgetPositiveInt.
export function legalBudgetKey(operation: LegalOperation, parts: readonly string[]): string {
  return ['legal', operation, ...parts].join(':')
}

// R19: each of the four budgets is independent (AND, not OR) and fails
// closed — a missing/invalid config value or a thrown limiter error (D1
// unavailable, write failure) denies the request rather than skipping the
// check or bypassing the limit.
export async function checkLegalBudget(
  db: DbClient,
  env: CloudflareEnv,
  kind: LegalBudgetKind,
  key: string,
): Promise<boolean> {
  const envKeys = LEGAL_BUDGET_ENV_KEYS[kind]
  const limit = parseLegalBudgetPositiveInt(env[envKeys.limit])
  const windowMs = parseLegalBudgetPositiveInt(env[envKeys.window])
  if (limit === null || windowMs === null) return false
  try {
    return await incrementHourlyRateLimit(db, key, limit, windowMs)
  } catch {
    return false
  }
}

// -- Public access: site/flag/entitlement/IP-budget (pre-session) -----------

export interface LegalPublicSiteContext {
  env: CloudflareEnv
  db: DbClient
  organizationId: string
  siteId: string
  canonicalOrigin: string
}

// -- U7: test-only entitlement injection seam --------------------------------
//
// Neither real plan ever sets legal_operations: true — both 'free' and
// 'growth' hardcode it false in billing-entitlements.ts, and
// organization-billing.ts's PLANS Set rejects any other stored plan value
// before getPlanEntitlements ever runs (proven by
// tests/unit/billing-plans.test.ts). That means no real D1 seed data can
// exercise the "entitled" branch of resolveLegalPublicSiteAccess without
// mocking getOrganizationBillingProjection outright, which this repo's
// no-internal-mocking rule (docs/testing-strategy.md) bans.
//
// This resolver type is the alternative: a typed, optional dependency
// injected into resolveLegalPublicSiteAccess AND resolveLegalStaffAccess,
// defaulting to the real production lookup in both. Deliberately NOT an
// env-var toggle — an env var could be flipped by an operator/config
// mistake in wrangler vars; a function reference cannot be supplied by any
// HTTP request, header, cookie, or environment variable, only by literal
// TypeScript source compiled into the same process that imports this module
// and passes a function value. Every production route under server/api/**
// calls resolveLegalPublicSiteAccess with exactly (event, operation, siteId)
// and resolveLegalStaffAccess with exactly (event, operation, options) —
// never an extra argument (grep `resolveLegalPublicSiteAccess(` and
// `resolveLegalStaffAccess(` across server/api for confirmation) — so this
// parameter is always the default in the shipped Worker. See
// task-U7-report.md for the yarn-build verification of this claim.
export type LegalEntitlementResolver = (db: DbClient, organizationId: string) => Promise<boolean>

async function defaultLegalEntitlementResolver(db: DbClient, organizationId: string): Promise<boolean> {
  const billing = await getOrganizationBillingProjection(db, organizationId)
  return billing.entitlements.legal_operations === true
}

export interface ResolveLegalPublicSiteAccessOptions {
  // R26 scopes Origin validation to "every cookie-authenticated legal
  // mutation" -- a same-origin GET never sends an Origin header per the
  // Fetch spec (response-tainting "basic"), so a non-mutating caller (e.g.
  // status.get.ts's read-only status poll) must be able to opt out.
  // Defaults to true so every existing mutation route (create/recover/
  // checkout/post-pay) keeps validating Origin unchanged without having to
  // pass this explicitly.
  validateOrigin?: boolean
}

// R13's explicit ordering: resolve only the site facts needed to determine
// its canonical origin, validate Origin, then check rollout group,
// entitlement, and the IP/site budget — all before a Better Auth session is
// established or reused. Per U9's public-route constraint, that ordering is
// enforced by this function's own control flow (each guard throws before the
// next check runs), not by caller discipline: it creates no identity,
// session, or D1 row of its own before returning. The actor and the
// remaining actor/site-aggregate/request-reference budgets are a separate
// step (requireLegalPublicActor + assertLegalPublicActorBudgets below),
// deliberately not folded in here, so a session is never touched until every
// pre-session guard has already passed.
export async function resolveLegalPublicSiteAccess(
  event: H3Event,
  operation: LegalOperation,
  siteId: string,
  resolveEntitlement: LegalEntitlementResolver = defaultLegalEntitlementResolver,
  options: ResolveLegalPublicSiteAccessOptions = {},
): Promise<LegalPublicSiteContext> {
  const validateOrigin = options.validateOrigin ?? true
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) throw new HTTPError({ statusCode: 503, message: 'Database not available' })

  const activeSite = await getActiveBlawbySite(db, siteId)
  if (!activeSite) {
    denyLegal({
      event, reason: 'site_ineligible', organizationId: null, siteId, actorKind: null,
      statusCode: 404, message: 'Site not found',
    })
  }
  const organizationId = activeSite.organization_id

  const canonicalOrigin = await resolveLegalSiteCanonicalOrigin(db, siteId)
  if (!canonicalOrigin) {
    denyLegal({
      event, reason: 'origin_unresolved', organizationId, siteId, actorKind: null,
      statusCode: 403, message: 'Site origin could not be resolved',
    })
  }
  if (validateOrigin && !validateLegalMutationOrigin(event, canonicalOrigin)) {
    denyLegal({
      event, reason: 'origin_invalid', organizationId, siteId, actorKind: null,
      statusCode: 403, message: 'Request origin is not trusted for this site',
    })
  }

  if (!isLegalOperationEnabled(env, operation)) {
    denyLegal({
      event, reason: 'rollout_group_disabled', organizationId, siteId, actorKind: null,
      statusCode: 403, message: 'Legal operations are not enabled for this deployment',
    })
  }

  const entitled = await resolveEntitlement(db, organizationId)
  if (!entitled) {
    denyLegal({
      event, reason: 'entitlement_missing', organizationId, siteId, actorKind: null,
      statusCode: 403, message: 'Legal operations are not included in this organization’s plan',
    })
  }

  const ipKey = legalBudgetKey(operation, ['ip', await hashClientIp(getClientIp(event)), siteId])
  const ipOk = await checkLegalBudget(db, env, 'ip_site_op', ipKey)
  if (!ipOk) {
    denyLegal({
      event, reason: 'ip_site_budget_exceeded', organizationId, siteId, actorKind: null,
      statusCode: 429, message: 'Too many requests from this network for this site',
    })
  }

  return { env, db, organizationId, siteId, canonicalOrigin }
}

// -- Public access: actor (post pre-session guards) --------------------------

export interface LegalPublicActor {
  actorId: string
  actorKind: Extract<LegalActorKind, 'human' | 'anonymous'>
}

// R13: actor kind is derived from Better Auth's own `isAnonymous` flag — the
// same signal server/api/public/review-requests/bind-session.post.ts already
// reads — never a parallel guest identity model. Pure/session-only so it is
// directly unit-testable without a real session or D1 (testing-strategy.md
// item 2); requireLegalPublicActor below is the D1/session-touching caller.
export function resolveLegalPublicActor(
  session: Awaited<ReturnType<typeof getAuthSession>>,
): LegalPublicActor | null {
  const user = session?.user as { id?: string; isAnonymous?: boolean } | undefined
  if (!user?.id) return null
  return { actorId: user.id, actorKind: user.isAnonymous ? 'anonymous' : 'human' }
}

// Forwards every set-cookie value from a Better Auth API `Response`
// (obtained with `asResponse: true`) onto the current H3Event's outgoing
// response. Same header-bag-variant handling server/api/sites.post.ts's
// activateOrganization already established (Headers.getSetCookie where
// supported, getAll('set-cookie') as a fallback, or a raw() bag) — extracted
// here rather than re-implemented so this stays the one place that logic
// lives for the legal-access module. Returns the raw set-cookie values so
// the caller can pull a session cookie out of them directly.
function forwardSetCookies(event: H3Event, response: Response): string[] {
  const headerBag = response.headers as Headers & {
    getSetCookie?: () => string[]
    getAll?: (_name: string) => string[]
    raw?: () => Record<string, string[]>
  }
  const setCookies = typeof headerBag.getSetCookie === 'function'
    ? headerBag.getSetCookie()
    : typeof headerBag.getAll === 'function'
      ? headerBag.getAll('set-cookie')
      : (headerBag.raw?.()['set-cookie'] || [])
  for (const cookieValue of setCookies) {
    appendResponseHeader(event, 'set-cookie', cookieValue)
  }
  return setCookies
}

// R13's "establish or reuse a Better Auth session" step. Must only be called
// after resolveLegalPublicSiteAccess has already passed for this request —
// it does not repeat the site/flag/entitlement/IP-budget checks itself.
//
// U9 reconciliation (task-u8-reconciliation-brief.md section 5a): the old
// version of this function only ever REUSED an existing session — a
// first-time visitor with no session cookie at all could never create an
// intake. This now establishes a fresh anonymous Better Auth session when
// there is NO session at all (getAuthSession returns null/undefined), using
// the same real, proven-in-this-repo pattern as
// tests/integration/legal-entitlement-rollout-matrix-d1.test.ts's
// `auth.api.signInAnonymous` and server/api/sites.post.ts's set-cookie
// forwarding. A session that DOES exist but resolves to no verified actor
// (a fabricated/expired anonymous identifier Better Auth itself already
// rejected — see the old comment this replaces) is a DIFFERENT case and
// keeps denying exactly as before; it is never treated as "no session".
// The anonymous plugin's signInAnonymous endpoint is not part of the
// statically-inferred Better Auth API surface in this file's tsconfig
// (same situation server/api/sites.post.ts already documents for
// setActiveOrganization) — cast narrowly to the one method actually called,
// rather than widening createAuth's return type globally.
interface SignInAnonymousApi {
  signInAnonymous(_input: { headers: HeadersInit, asResponse: true }): Promise<Response>
}

export async function requireLegalPublicActor(
  event: H3Event,
  context: LegalPublicSiteContext,
): Promise<LegalPublicActor> {
  const session = await getAuthSession(event, context.env)

  if (!session) {
    const auth = createAuth(context.env)
    const anonymousApi = auth.api as unknown as SignInAnonymousApi
    let signIn: Response | undefined
    try {
      signIn = await anonymousApi.signInAnonymous({ headers: event.req.headers, asResponse: true })
    } catch {
      signIn = undefined
    }
    if (!signIn || !signIn.ok) {
      denyLegal({
        event, reason: 'session_required', organizationId: context.organizationId, siteId: context.siteId, actorKind: null,
        statusCode: 401, message: 'Authentication required',
      })
    }

    // event.req.headers does not see the response's set-cookie, so
    // getAuthSession(event, env) cannot be re-run to observe the new session —
    // instead, resolve it directly from the freshly-issued cookies, after
    // forwarding every set-cookie value onto the outgoing response so the
    // browser retains the new session too.
    const setCookies = forwardSetCookies(event, signIn)
    // Every cookie the sign-in issued, not whichever came back first: Better
    // Auth decides how many it sets and in what order, and the session token is
    // not promised to be the first of them.
    const cookieHeader = setCookies.map(value => value.split(';')[0]).filter(Boolean).join('; ')
    const freshSession = cookieHeader
      ? await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader }) })
      : null
    const freshActor = resolveLegalPublicActor(freshSession)
    if (!freshActor) {
      denyLegal({
        event, reason: 'session_required', organizationId: context.organizationId, siteId: context.siteId, actorKind: null,
        statusCode: 401, message: 'Authentication required',
      })
    }
    return freshActor
  }

  const actor = resolveLegalPublicActor(session)
  if (!actor) {
    denyLegal({
      event, reason: 'session_required', organizationId: context.organizationId, siteId: context.siteId, actorKind: null,
      statusCode: 401, message: 'Authentication required',
    })
  }
  return actor
}

// R19's remaining three budgets, applied once an actor is known: actor/site/
// operation, site/operation aggregate, and (when the caller has a request
// reference to protect) request-reference follow-up. All applicable checks
// must pass — this is an AND, not an OR (AE8: IP and site budgets both still
// apply even when independently satisfied). requestReference is the R14 UUID
// value itself, used only to build a rate-limit key here — never logged (see
// emitLegalSecurityEvent's contract) and never passed to
// emitLegalSecurityEvent.
export async function assertLegalPublicActorBudgets(
  event: H3Event,
  context: LegalPublicSiteContext,
  operation: LegalOperation,
  actor: LegalPublicActor,
  requestReference?: string | null,
): Promise<void> {
  const actorKey = legalBudgetKey(operation, ['actor', actor.actorId, context.siteId])
  const actorOk = await checkLegalBudget(context.db, context.env, 'actor_site_op', actorKey)
  if (!actorOk) {
    denyLegal({
      event, reason: 'actor_site_budget_exceeded', organizationId: context.organizationId, siteId: context.siteId, actorKind: actor.actorKind,
      statusCode: 429, message: 'Too many requests from this actor for this site',
    })
  }

  const siteKey = legalBudgetKey(operation, ['site', context.siteId])
  const siteOk = await checkLegalBudget(context.db, context.env, 'site_op', siteKey)
  if (!siteOk) {
    denyLegal({
      event, reason: 'site_budget_exceeded', organizationId: context.organizationId, siteId: context.siteId, actorKind: actor.actorKind,
      statusCode: 429, message: 'This site has reached its request limit',
    })
  }

  if (requestReference) {
    const refKey = legalBudgetKey(operation, ['ref', requestReference])
    const refOk = await checkLegalBudget(context.db, context.env, 'request_ref', refKey)
    if (!refOk) {
      denyLegal({
        event, reason: 'request_reference_budget_exceeded', organizationId: context.organizationId, siteId: context.siteId, actorKind: actor.actorKind,
        statusCode: 429, message: 'Too many follow-up requests for this request reference',
      })
    }
  }
}

// -- U5: staff mutation-origin pre-check + shared no-store response --------

// R26/U5's origin-before-eligibility ordering: the plan's step 3 says
// "validate mutation origin against the exact dashboard origin before
// eligibility or token acquisition." No dedicated dashboard-origin
// CloudflareEnv field exists in this repo (grepped LEGAL_/CONNECT/ORIGIN
// prefixes in server/utils/auth.ts) — flagged as a brief defect in the U5
// report. NUXT_PUBLIC_PLATFORM_DOMAIN is the closest existing candidate
// (it's already the dashboard's own trusted-origin entry in
// trustedOriginsForAuth) and is reused here rather than inventing a new
// env var, but it was not purpose-built for this check and should be
// replaced by a dedicated field once U8/U10 make the real requirement
// concrete.
export function resolveLegalDashboardOrigin(env: CloudflareEnv): string | null {
  return normalizeOrigin(env.NUXT_PUBLIC_PLATFORM_DOMAIN)
}

// Called as the FIRST statement in every staff legal mutation route,
// strictly before resolveLegalStaffAccess (which does session/membership/
// site/flag/entitlement resolution) — a fast, cheap, pre-session reject.
// Emits R29 with organizationId/siteId null (neither is known yet at this
// point) and actorKind 'staff' since only staff routes call this.
export function assertLegalStaffMutationOrigin(event: H3Event, env: CloudflareEnv): void {
  const dashboardOrigin = resolveLegalDashboardOrigin(env)
  if (!dashboardOrigin) {
    denyLegal({
      event, reason: 'origin_unresolved', organizationId: null, siteId: null, actorKind: 'staff',
      statusCode: 403, message: 'Dashboard origin could not be resolved',
    })
  }
  if (!validateLegalMutationOrigin(event, dashboardOrigin)) {
    denyLegal({
      event, reason: 'origin_invalid', organizationId: null, siteId: null, actorKind: 'staff',
      statusCode: 403, message: 'Request origin is not trusted for this dashboard',
    })
  }
}

// -- U6: R30 reviewed Stripe payment-origin allowlist ------------------

// Shared by U6's Checkout/Payment Link URL (server/api/public/sites/
// [siteId]/legal/intakes/checkout.post.ts and post-pay.post.ts). U5's
// Connect onboarding URL (server/api/dashboard/legal/connect/index.post.ts)
// predates this helper and keeps its own inline allowlist/parsing --
// deliberately not touched here to avoid unrelated-file scope creep on a
// working, already-shipped route; a future task could migrate it onto this
// shared helper. PLACEHOLDER hosts -- Stripe Checkout Session's and Payment
// Link's real response host(s) for this environment are not yet confirmed
// against a live Stripe account or U8's real contract; flagged for review
// before this is treated as a verified boundary (see U6 report).
export const STRIPE_PAYMENT_ORIGIN_ALLOWLIST = new Set(['https://checkout.stripe.com', 'https://buy.stripe.com'])

// R30: HTTPS parsing + exact-origin allowlist check + userinfo rejection.
// Returns the normalized URL string on success, or null for anything
// malformed, non-HTTPS, userinfo-bearing, or outside the allowlist -- the
// caller turns a null into a sanitized invalid-upstream (502) response.
// "Redirected" upstream URLs (R30's other named failure mode) are already
// rejected earlier, inside blawby-client.ts's fetchBlawby (redirect:
// 'manual' + 3xx/opaqueredirect classification) -- this function only
// needs to validate the URL VALUE Blawby's JSON body returned, not chase a
// live redirect itself.
export function validateLegalPaymentUrl(
  raw: string,
  allowlist: ReadonlySet<string> = STRIPE_PAYMENT_ORIGIN_ALLOWLIST,
): string | null {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null
  if (!allowlist.has(parsed.origin)) return null
  return parsed.toString()
}

// -- I3: R22 Connect callback URL validation --------------------------------

// R22 requires the configured Connect callback URLs be built from "exact
// per-environment HTTPS return and refresh settings." Before this, the only
// check anywhere in the branch was a bare non-empty-string test on
// LEGAL_BLAWBY_CALLBACK_URL_RETURN/LEGAL_BLAWBY_CALLBACK_URL_REFRESH in
// server/api/dashboard/legal/connect/index.post.ts, with no HTTPS check, no
// userinfo/fragment rejection, and no deploy-time check anywhere
// (scripts/check-deploy-env.mjs does not exist in this repo).
//
// This is a pure function (same shape as validateLegalPaymentUrl above) so
// it is directly unit-testable without D1/session/network. Fails closed:
// returns null for anything malformed, non-HTTPS, userinfo-bearing, or
// fragment-bearing — the caller turns a null into a 503 misconfiguration
// response (same fail-closed pattern as
// legal-intake-references.ts's parseLegalIntakeDigestKeyConfig) rather than
// forwarding a malformed/insecure URL to Blawby.
export function validateLegalCallbackUrl(raw: string): string | null {
  if (!raw) return null
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  if (parsed.username || parsed.password) return null
  if (parsed.hash) return null
  return parsed.toString()
}

// R26's "every legal response is Cache-Control: no-store", applied once
// here instead of by hand in every U5 route file. Wraps jsonResponse
// (which does not set this header) rather than duplicating its
// content-type logic. Reused unmodified for U6's public-site-origin
// routes -- its signature already takes no dashboard-specific input, so no
// generalization was needed.
export function legalJsonResponse(body: ApiValue, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('cache-control', 'no-store')
  return jsonResponse(body, { ...init, headers })
}

// U6: R26 says "every legal response is Cache-Control: no-store" -- not
// just success responses. U5's staff routes use apiErrorResponse directly
// for their error paths, which does not set this header (a pre-existing
// gap flagged here rather than fixed on U5's already-shipped files, per
// this plan's "do not broaden scope" constraint). U6's new public routes
// use this wrapper for every error response instead, so the new route
// family satisfies R26 in full.
export function legalApiErrorResponse(event: H3Event, status: number, code: string, message: string): Response {
  const response = apiErrorResponse(event, status, code, message)
  response.headers.set('cache-control', 'no-store')
  return response
}
