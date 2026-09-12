// POST /api/public/sites/[siteId]/legal/intakes/checkout
//
// Begins (or replaces) a Blawby Checkout/Payment Link session for an
// already-created intake (LegalOperation 'intake_payment', BlawbyRouteKey
// 'intakeCheckout' -- real U8 route `POST
// /intakes/{uuid}/checkout-session`, see blawby-client.ts). The path param
// is the Blawby intake UUID (record.blawbyIntakeId), looked up server-side
// from the durable record -- never sent as a body field.
//
// Same R13 call order as index.post.ts, using 'intake_payment' as the
// gated operation (this is a payment-adjacent write, not the base intake
// flag). Checkout requires a matching bound intake -- the client sends
// ONLY its request reference (never a Blawby intake id or checkout session
// id directly; those are looked up server-side from the durable record and
// from Blawby's own validated response, per plan step 4's "attach only the
// session returned in a validated Blawby response").
//
// R17/R30: a fresh checkout (no prior session) uses attachLegalCheckoutSessionInitial
// (null-to-value); an existing session being refreshed uses
// replaceLegalCheckoutSession (compare-and-set against the expected prior
// value, so a concurrent stale replacement cannot overwrite it). Either
// way, the returned checkout/payment URL is validated against the
// reviewed Stripe payment-origin allowlist (R30) before it is ever
// returned to the browser.

import { rethrowHttpError } from '~/server/utils/api-response'
import { callBlawbyRoute } from '~/server/utils/blawby-client'
import {
  assertLegalPublicActorBudgets,
  legalApiErrorResponse,
  legalJsonResponse,
  legalRequestCorrelationId,
  requireLegalPublicActor,
  resolveLegalPublicSiteAccess,
  validateLegalPaymentUrl,
} from '~/server/utils/legal-access'
import {
  attachLegalCheckoutSessionInitial,
  findLegalIntakeReferenceForActor,
  replaceLegalCheckoutSession,
} from '~/server/utils/legal-intake-references'
import { getClientIp } from '~/server/utils/hourly-rate-limit'

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface IntakeCheckoutResult {
  checkoutSessionId: string
  paymentUrl: string
}

function parseIntakeCheckoutResult(body: unknown): IntakeCheckoutResult | undefined {
  if (!body || typeof body !== 'object') return undefined
  const record = body as Record<string, unknown>
  // R15 reconciliation: U8's real checkout-session response
  // (createPracticeClientIntakeCheckoutSessionResponseSchema) returns
  // {url, session_id} -- not {paymentUrl, checkoutSessionId}. Read the real
  // field names here; this route's own internal/response shape is
  // unaffected.
  return typeof record.session_id === 'string' && typeof record.url === 'string'
    ? { checkoutSessionId: record.session_id, paymentUrl: record.url }
    : undefined
}

export default defineHandler(async (event) => {
  const correlationId = legalRequestCorrelationId(event)
  const siteId = String(getRouterParam(event, 'siteId') || '').trim()
  if (!siteId) return legalApiErrorResponse(event, 400, 'LEGAL_INTAKE_SITE_ID_REQUIRED', 'Site id is required')

  try {
    const context = await resolveLegalPublicSiteAccess(event, 'intake_payment', siteId)
    const actor = await requireLegalPublicActor(event, context)

    const body = await readBody(event).catch(() => null) as { requestReference?: unknown } | null
    const requestReference = typeof body?.requestReference === 'string' ? body.requestReference.trim() : ''
    if (!UUID_V4_PATTERN.test(requestReference)) {
      return legalApiErrorResponse(event, 400, 'LEGAL_INTAKE_REQUEST_REFERENCE_INVALID', 'A valid request reference (UUID v4) is required')
    }

    await assertLegalPublicActorBudgets(event, context, 'intake_payment', actor, requestReference)

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
      return legalApiErrorResponse(event, 409, 'LEGAL_INTAKE_CHECKOUT_REQUIRES_INTAKE', 'Checkout requires an already-created intake')
    }

    const result = await callBlawbyRoute<IntakeCheckoutResult>(context.env, {
      routeKey: 'intakeCheckout',
      scope: 'legal:intakes',
      method: 'POST',
      identity: { organizationId: context.organizationId, actorId: actor.actorId, actorKind: actor.actorKind },
      correlationId,
      requestReference,
      pathParam: record.blawbyIntakeId,
      clientIp: getClientIp(event),
      body: {
        ...(record.checkoutSessionId ? { priorCheckoutSessionId: record.checkoutSessionId } : {}),
      },
      parseResponse: parseIntakeCheckoutResult,
    })

    const paymentUrl = validateLegalPaymentUrl(result.paymentUrl)
    if (!paymentUrl) {
      return legalApiErrorResponse(event, 502, 'LEGAL_INTAKE_CHECKOUT_URL_INVALID', 'Blawby returned an untrusted checkout/payment URL')
    }

    const attach = record.checkoutSessionId
      ? await replaceLegalCheckoutSession(context.db, event, {
          requestReference,
          organizationId: context.organizationId,
          siteId: context.siteId,
          expectedPriorSessionId: record.checkoutSessionId,
          newSessionId: result.checkoutSessionId,
        })
      : await attachLegalCheckoutSessionInitial(context.db, event, {
          requestReference,
          organizationId: context.organizationId,
          siteId: context.siteId,
          checkoutSessionId: result.checkoutSessionId,
        })
    if (attach === 'conflict') {
      return legalApiErrorResponse(event, 409, 'LEGAL_INTAKE_CHECKOUT_SESSION_CONFLICT', 'This request reference already has a different checkout session bound')
    }

    return legalJsonResponse({ checkoutSessionId: result.checkoutSessionId, checkoutUrl: paymentUrl })
  } catch (error) {
    rethrowHttpError(error)
    return legalApiErrorResponse(event, 500, 'LEGAL_INTAKE_CHECKOUT_FAILED', 'Failed to start checkout for this intake')
  }
})

import { defineHandler } from 'nitro';
import { getRouterParam, readBody } from 'nitro/h3';
