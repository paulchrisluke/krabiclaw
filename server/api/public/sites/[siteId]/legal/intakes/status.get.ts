// GET /api/public/sites/[siteId]/legal/intakes/status?requestReference=...
//
// Read-only status poll for a bound intake (LegalOperation
// 'intake_without_payment' -- status is a plain read of the intake's own
// state, not a payment action; BlawbyRouteKey 'intakeStatus' -- real U8
// route `GET /intakes/{uuid}/status`, see blawby-client.ts). The path param
// is the Blawby intake UUID (record.blawbyIntakeId).
//
// Same R13 call order as the other routes in this family, EXCEPT Origin
// validation: R26 scopes Origin validation to "every cookie-authenticated
// legal mutation" -- a same-origin GET never sends an Origin header per the
// Fetch spec (response-tainting "basic"), so this read-only status poll
// would 403 on every real browser request if it validated Origin like the
// mutation routes do. resolveLegalPublicSiteAccess is called with
// { validateOrigin: false } below to opt out of that single check while
// keeping every other guard (site eligibility, rollout flag, entitlement,
// IP budget, session, and all four R19 budgets via
// assertLegalPublicActorBudgets) unchanged -- R19's budgets are not limited
// to mutating verbs.

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
import { findLegalIntakeReferenceForActor } from '~/server/utils/legal-intake-references'

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface IntakeStatusResult {
  status: string
}

function parseIntakeStatusResult(body: unknown): IntakeStatusResult | undefined {
  if (!body || typeof body !== 'object') return undefined
  const record = body as Record<string, unknown>
  return typeof record.status === 'string' ? { status: record.status } : undefined
}

export default defineHandler(async (event) => {
  const correlationId = legalRequestCorrelationId(event)
  const siteId = String(getRouterParam(event, 'siteId') || '').trim()
  if (!siteId) return legalApiErrorResponse(event, 400, 'LEGAL_INTAKE_SITE_ID_REQUIRED', 'Site id is required')

  try {
    const context = await resolveLegalPublicSiteAccess(
      event, 'intake_without_payment', siteId, undefined, { validateOrigin: false },
    )
    const actor = await requireLegalPublicActor(event, context)

    const query = getQuery(event)
    const requestReference = typeof query.requestReference === 'string' ? query.requestReference.trim() : ''
    if (!UUID_V4_PATTERN.test(requestReference)) {
      return legalApiErrorResponse(event, 400, 'LEGAL_INTAKE_REQUEST_REFERENCE_INVALID', 'A valid request reference (UUID v4) is required')
    }

    await assertLegalPublicActorBudgets(event, context, 'intake_without_payment', actor, requestReference)

    const record = await findLegalIntakeReferenceForActor(context.db, {
      requestReference,
      organizationId: context.organizationId,
      siteId: context.siteId,
      actorId: actor.actorId,
    })
    if (!record) {
      return legalApiErrorResponse(event, 404, 'LEGAL_INTAKE_NOT_FOUND', 'No intake was found for this request reference')
    }
    if (!record.blawbyIntakeId) {
      // Claimed but never attached -- there is nothing at Blawby to poll
      // yet, so this never calls Blawby with a nonexistent intake id.
      return legalJsonResponse({ status: 'pending' })
    }

    const result = await callBlawbyRoute<IntakeStatusResult>(context.env, {
      routeKey: 'intakeStatus',
      scope: 'legal:intakes',
      method: 'GET',
      identity: { organizationId: context.organizationId, actorId: actor.actorId, actorKind: actor.actorKind },
      correlationId,
      // Matches this repo's existing GET-route convention (e.g. staff
      // practiceRead): no body on a GET, only the trusted headers.
      // requestReference is still forwarded as a header (R18); the
      // {uuid} path param is what U8 actually keys the lookup on --
      // KrabiClaw's own durable record already bound record.blawbyIntakeId
      // to this exact request reference.
      requestReference,
      pathParam: record.blawbyIntakeId,
      parseResponse: parseIntakeStatusResult,
    })

    return legalJsonResponse({ status: result.status })
  } catch (error) {
    rethrowHttpError(error)
    return legalApiErrorResponse(event, 500, 'LEGAL_INTAKE_STATUS_FAILED', 'Failed to fetch intake status')
  }
})

import { defineHandler } from 'nitro';
import { getQuery, getRouterParam } from 'nitro/h3';
