// POST /api/public/sites/[siteId]/legal/intakes/recover
//
// R16/plan step 3's "recover by request reference after response loss"
// WITHOUT resubmitting the original payload -- distinct from retrying
// index.post.ts (which is the same-payload retry path and already handles
// recovery via claimLegalIntakeReference's 'recovered' outcome). This
// route is for the case where the browser only still has its retained
// request reference (see composables/useLegalIntakeRequest.ts) and needs
// to know what KrabiClaw/Blawby already did with it.
//
// Same R13 call order as index.post.ts:
//   resolveLegalPublicSiteAccess -> requireLegalPublicActor
//   -> assertLegalPublicActorBudgets -> findLegalIntakeReferenceForActor (U4)
//   -> callBlawbyRoute (U2), only if no Blawby intake id is bound yet.
// BlawbyRouteKey 'intakeRecover' -- real U8 route `GET
// /intakes/requests/{request_id}` (blawby-client.ts). The path param IS the
// request reference -- U8 correlates by the {request_id} path segment
// itself, so no `x-krabiclaw-request-reference` header is sent for this
// specific call (unlike every other route in this family).

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
import { attachLegalIntakeUuid, findLegalIntakeReferenceForActor } from '~/server/utils/legal-intake-references'

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface IntakeRecoverResult {
  intakeId: string
  status: string
}

function parseIntakeRecoverResult(body: unknown): IntakeRecoverResult | undefined {
  if (!body || typeof body !== 'object') return undefined
  const record = body as Record<string, unknown>
  // R15 reconciliation: this route reuses U8's create-intake response
  // schema (createPracticeClientIntakeResponseSchema), which returns `uuid`,
  // not `intakeId` -- see index.post.ts's parseIntakeCreateResult for the
  // same fix and rationale.
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
    const context = await resolveLegalPublicSiteAccess(event, 'intake_without_payment', siteId)
    const actor = await requireLegalPublicActor(event, context)

    const body = await readBody(event).catch(() => null) as { requestReference?: unknown } | null
    const requestReference = typeof body?.requestReference === 'string' ? body.requestReference.trim() : ''
    if (!UUID_V4_PATTERN.test(requestReference)) {
      return legalApiErrorResponse(event, 400, 'LEGAL_INTAKE_REQUEST_REFERENCE_INVALID', 'A valid request reference (UUID v4) is required')
    }

    await assertLegalPublicActorBudgets(event, context, 'intake_without_payment', actor, requestReference)

    // Ownership mismatch and "no such row" both surface as 404 here -- this
    // read-only lookup makes the two indistinguishable by design (see
    // findLegalIntakeReferenceForActor's doc comment), so no separate R29
    // emission is needed for a lookup miss the way claimLegalIntakeReference
    // emits for an ownership conflict on a WRITE.
    const record = await findLegalIntakeReferenceForActor(context.db, {
      requestReference,
      organizationId: context.organizationId,
      siteId: context.siteId,
      actorId: actor.actorId,
    })
    if (!record) {
      return legalApiErrorResponse(event, 404, 'LEGAL_INTAKE_NOT_FOUND', 'No intake was found for this request reference')
    }

    // Already durably bound to a Blawby intake -- no second Blawby call
    // needed, this IS the recovered state.
    if (record.blawbyIntakeId) {
      return legalJsonResponse({ intakeId: record.blawbyIntakeId, status: 'recovered' })
    }

    // KrabiClaw's own claim exists but was never attached (the create
    // call's response was lost after Blawby processed it, or Blawby is
    // itself idempotent on this request reference) -- ask Blawby by
    // request reference alone, then attach.
    const result = await callBlawbyRoute<IntakeRecoverResult>(context.env, {
      routeKey: 'intakeRecover',
      scope: 'legal:intakes',
      method: 'GET',
      identity: { organizationId: context.organizationId, actorId: actor.actorId, actorKind: actor.actorKind },
      correlationId,
      // No requestReference header here -- the {request_id} path param IS
      // the request reference (see file-header comment); pathParam carries
      // it instead.
      pathParam: requestReference,
      parseResponse: parseIntakeRecoverResult,
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
    return legalApiErrorResponse(event, 500, 'LEGAL_INTAKE_RECOVER_FAILED', 'Failed to recover the intake')
  }
})

import { defineHandler } from 'nitro';
import { getRouterParam, readBody } from 'nitro/h3';
