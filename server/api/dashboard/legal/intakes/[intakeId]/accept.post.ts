// POST /api/dashboard/legal/intakes/[intakeId]/accept
//
// Staff acceptance of a payment-required intake (LegalOperation
// 'intake_payment', BlawbyRouteKey 'intakeAccept' — real U8 route `PATCH
// /intakes/{uuid}/triage`, see blawby-client.ts). [intakeId] is the Blawby
// intake UUID, interpolated into the route's path param; it is NOT sent as
// a body field. A mutation: Origin is validated FIRST, before
// resolveLegalStaffAccess (see assertLegalStaffMutationOrigin).
//
// U9 reconciliation scope note: U8's real triage route is a full decision
// dispatch — `{ status: 'accepted' | 'declined', reason?: string }` (reason
// required when declining) — not accept-only. This route only ever sends
// the 'accepted' branch; declining an intake with a reason is NOT
// implemented here (known gap — see task-u8-reconciliation-report.md).

import { apiErrorResponse, cloudflareEnv, rethrowHttpError } from '~/server/utils/api-response'
import { callBlawbyRoute } from '~/server/utils/blawby-client'
import { assertLegalStaffMutationOrigin, legalJsonResponse, legalRequestCorrelationId, resolveLegalStaffAccess } from '~/server/utils/legal-access'

interface IntakeAcceptResult {
  id: string
  status: string
}

function parseIntakeAcceptResult(body: unknown): IntakeAcceptResult | undefined {
  if (!body || typeof body !== 'object') return undefined
  const record = body as Record<string, unknown>
  // R15 reconciliation: U8's real triage response
  // (updateIntakeTriageStatusResponseSchema) returns {uuid, triage_status},
  // not {id, status} -- see blawby-ts's practice-client-intakes.validation.ts.
  return typeof record.uuid === 'string' && typeof record.triage_status === 'string'
    ? { id: record.uuid, status: record.triage_status }
    : undefined
}

export default defineHandler(async (event) => {
  const correlationId = legalRequestCorrelationId(event)
  const env = cloudflareEnv(event)
  assertLegalStaffMutationOrigin(event, env)

  const intakeId = String(getRouterParam(event, 'intakeId') || '').trim()
  if (!intakeId) return apiErrorResponse(event, 400, 'LEGAL_INTAKE_ID_REQUIRED', 'Intake id is required')

  try {
    // The route param (never a body field) is the only identifier
    // forwarded — R6 keeps every other outbound field server-derived.
    const access = await resolveLegalStaffAccess(event, 'intake_payment', { pathname: '/api/dashboard/legal/intakes/[intakeId]/accept' })

    const result = await callBlawbyRoute(access.env, {
      routeKey: 'intakeAccept',
      scope: 'legal:intakes',
      method: 'PATCH',
      identity: { organizationId: access.organizationId, actorId: access.userId, actorKind: 'human' },
      correlationId,
      pathParam: intakeId,
      body: { status: 'accepted' },
      parseResponse: parseIntakeAcceptResult,
    })

    return legalJsonResponse({ intake: result })
  } catch (error) {
    rethrowHttpError(error)
    return apiErrorResponse(event, 500, 'LEGAL_INTAKE_ACCEPT_FAILED', 'Failed to accept the intake')
  }
})

import { defineHandler } from 'nitro';
import { getRouterParam } from 'nitro/h3';
