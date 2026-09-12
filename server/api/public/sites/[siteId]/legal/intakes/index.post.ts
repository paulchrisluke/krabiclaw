// POST /api/public/sites/[siteId]/legal/intakes
//
// Public intake creation (LegalOperation 'intake_without_payment',
// BlawbyRouteKey 'intakeCreate' -- real U8 route `POST /intakes`, see
// blawby-client.ts. Body must NOT include `slug` or `user_id` -- U8
// strips/rejects those as forbidden identity fields;
// legal-intake-payload.ts's allowlist already omits both, so no change was
// needed there).
//
// R13's exact call order, enforced by this file's own statement order:
//   resolveLegalPublicSiteAccess -> requireLegalPublicActor
//   -> assertLegalPublicActorBudgets -> claimLegalIntakeReference (U4)
//   -> callBlawbyRoute (U2)
// Origin is validated INSIDE resolveLegalPublicSiteAccess against the
// SITE's own canonical origin (context.canonicalOrigin) -- not the
// dashboard origin U5's staff routes use. getAuthSession is never called
// directly here; only requireLegalPublicActor may call it, and only after
// phase 1 has already passed.
//
// R15: the create-intake payload shape is a U6 judgment call, not a
// confirmed U8/product contract -- see
// server/utils/legal-intake-payload.ts for the shape and its flags.
//
// R29 note: claimLegalIntakeReference already calls emitLegalSecurityEvent
// itself for both the 'ownership_conflict' and 'payload_conflict' outcomes
// below (reasons 'legal_intake_ownership_conflict' /
// 'legal_intake_payload_conflict', see legal-intake-references.ts) -- this
// route does not call it a second time for the same outcome.

import { rethrowHttpError } from '~/server/utils/api-response'
import { callBlawbyRoute } from '~/server/utils/blawby-client'
import {
  assertLegalPublicActorBudgets,
  legalApiErrorResponse,
  legalJsonResponse,
  legalRequestCorrelationId,
  requireLegalPublicActor,
  resolveLegalPublicSiteAccess,
} from '~/server/utils/legal-access'
import { attachLegalIntakeUuid, claimLegalIntakeReference } from '~/server/utils/legal-intake-references'
import { buildBlawbyIntakeCreateBody, validateLegalIntakePayload } from '~/server/utils/legal-intake-payload'
import { getClientIp } from '~/server/utils/hourly-rate-limit'

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface IntakeCreateResult {
  intakeId: string
  status: string
}

function parseIntakeCreateResult(body: unknown): IntakeCreateResult | undefined {
  if (!body || typeof body !== 'object') return undefined
  const record = body as Record<string, unknown>
  // R15 reconciliation: U8's real create-intake response is
  // createPracticeClientIntakeResponseSchema, which returns `uuid`, not
  // `intakeId` (see blawby-ts's practice-client-intakes.validation.ts). Read
  // the real field name here and keep mapping it onto this route's own
  // `intakeId` field below/at the call site -- KrabiClaw's own response
  // contract to its callers is unaffected by this fix.
  //
  // A non-empty uuid is required: an empty string is a valid unique-index
  // value in D1, so treating "" as success here would durably attach an
  // empty blawby_intake_id, permanently blocking a real intake id from ever
  // being attached to this request reference. Treat it as malformed, same as
  // a missing/wrong-typed field.
  return typeof record.uuid === 'string' && record.uuid.length > 0 && typeof record.status === 'string'
    ? { intakeId: record.uuid, status: record.status }
    : undefined
}

export default defineHandler(async (event) => {
  const correlationId = legalRequestCorrelationId(event)
  const siteId = String(getRouterParam(event, 'siteId') || '').trim()
  if (!siteId) return legalApiErrorResponse(event, 400, 'LEGAL_INTAKE_SITE_ID_REQUIRED', 'Site id is required')

  try {
    // Phase 1: site facts, Origin, rollout flag, entitlement, IP/site
    // budget -- strictly before any session is touched (R13).
    const context = await resolveLegalPublicSiteAccess(event, 'intake_without_payment', siteId)

    // Phase 2: establish/reuse the Better Auth session (only
    // requireLegalPublicActor calls getAuthSession).
    const actor = await requireLegalPublicActor(event, context)

    const body = await readBody(event).catch(() => null) as { requestReference?: unknown, payload?: unknown } | null
    const requestReference = typeof body?.requestReference === 'string' ? body.requestReference.trim() : ''
    if (!UUID_V4_PATTERN.test(requestReference)) {
      return legalApiErrorResponse(event, 400, 'LEGAL_INTAKE_REQUEST_REFERENCE_INVALID', 'A valid request reference (UUID v4) is required')
    }

    const payload = validateLegalIntakePayload(body?.payload)
    if (!payload) {
      return legalApiErrorResponse(event, 400, 'LEGAL_INTAKE_PAYLOAD_INVALID', 'Intake payload is missing required fields')
    }

    // Phase 3: actor/site-aggregate/request-reference budgets.
    await assertLegalPublicActorBudgets(event, context, 'intake_without_payment', actor, requestReference)

    // Phase 4 (U4): durable claim BEFORE any Blawby call (KTD4).
    const claim = await claimLegalIntakeReference(context.db, event, context.env, {
      requestReference,
      organizationId: context.organizationId,
      siteId: context.siteId,
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      // LegalIntakePayload is a concrete shape (no index signature); the
      // digest/claim layer intentionally accepts a plain Record<string,
      // unknown> since it never interprets specific fields itself.
      payload: { ...payload } as Record<string, unknown>,
    })

    if (claim.status === 'ownership_conflict') {
      return legalApiErrorResponse(event, 409, 'LEGAL_INTAKE_OWNERSHIP_CONFLICT', 'This request reference belongs to a different actor or site')
    }
    if (claim.status === 'payload_conflict') {
      return legalApiErrorResponse(event, 409, 'LEGAL_INTAKE_PAYLOAD_CONFLICT', 'This request reference was already used with a different intake payload')
    }
    if (claim.status === 'digest_key_unconfigured') {
      // Config-error path (U4's own open concern in legal-intake-references.ts)
      // -- not one of R29's five denial categories, so no
      // emitLegalSecurityEvent call here. Surfaced as R24's "dependency
      // unavailability" (sanitized 503), matching the
      // BLAWBY_NOT_CONFIGURED-style responses used elsewhere in this route
      // family for missing server config.
      return legalApiErrorResponse(event, 503, 'LEGAL_INTAKE_DIGEST_KEY_UNCONFIGURED', 'Legal intake is not configured for this environment')
    }

    // R16: same-reference/same-payload recovers. If the durable record
    // already has a Blawby intake id attached, return it without a second
    // Blawby call -- this IS the response-loss-recovery path for a retried
    // create.
    if (claim.status === 'recovered' && claim.record.blawbyIntakeId) {
      return legalJsonResponse({ intakeId: claim.record.blawbyIntakeId, status: 'recovered' })
    }

    // Phase 5 (U2): fresh outbound identity built by callBlawbyRoute;
    // requestReference forwarded on every call in this route family (R18).
    const result = await callBlawbyRoute<IntakeCreateResult>(context.env, {
      routeKey: 'intakeCreate',
      scope: 'legal:intakes',
      method: 'POST',
      identity: { organizationId: context.organizationId, actorId: actor.actorId, actorKind: actor.actorKind },
      correlationId,
      requestReference,
      clientIp: getClientIp(event),
      body: buildBlawbyIntakeCreateBody(payload),
      parseResponse: parseIntakeCreateResult,
    })

    const attach = await attachLegalIntakeUuid(context.db, event, {
      requestReference,
      organizationId: context.organizationId,
      siteId: context.siteId,
      blawbyIntakeId: result.intakeId,
    })
    if (attach === 'conflict') {
      return legalApiErrorResponse(event, 409, 'LEGAL_INTAKE_ATTACH_CONFLICT', 'This request reference is already bound to a different Blawby intake')
    }

    return legalJsonResponse({ intakeId: result.intakeId, status: result.status })
  } catch (error) {
    rethrowHttpError(error)
    return legalApiErrorResponse(event, 500, 'LEGAL_INTAKE_CREATE_FAILED', 'Failed to create the intake')
  }
})

import { defineHandler } from 'nitro';
import { getRouterParam, readBody } from 'nitro/h3';
