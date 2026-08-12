import { getOrgAdapter } from 'better-auth/plugins'
import { defineEventHandler, readBody, setResponseHeader } from 'h3'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth, getAuthSession } from '~/server/utils/auth'
import {
  assertStripeProviderMode,
  OrganizationSubscriptionReconciliationError,
  reconcileOrganizationSubscription,
} from '~/server/utils/organization-subscription-reconciliation'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import { createStripeClient } from '~/server/utils/stripe-client'
import {
  applyStripeProcessedInvoiceReplay,
  assertStripeProcessedInvoiceReplayOperatorSession,
  parseStripeProcessedInvoiceReplayRequest,
  previewStripeProcessedInvoiceReplay,
  StripeProcessedInvoiceReplayError,
} from '~/server/utils/stripe-processed-invoice-replay'

function noStore(body: unknown, status?: number): Response {
  return jsonResponse(body as ApiValue, {
    ...(status === undefined ? {} : { status }),
    headers: { 'cache-control': 'no-store' },
  })
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return noStore({ error: 'Database not available' }, 500)

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['billing'] })
  if (permissionDenied) {
    permissionDenied.headers.set('cache-control', 'no-store')
    return permissionDenied
  }

  try {
    const session = await getAuthSession(event, env)
    const actor = assertStripeProcessedInvoiceReplayOperatorSession(session)
    const request = parseStripeProcessedInvoiceReplayRequest(await readBody<unknown>(event))
    if (typeof env.BETTER_AUTH_SECRET !== 'string' || !env.BETTER_AUTH_SECRET) {
      throw new StripeProcessedInvoiceReplayError(
        'configuration_error',
        500,
        'Operator approval configuration is unavailable.',
      )
    }

    assertStripeProviderMode(env.STRIPE_SECRET_KEY, request.input.providerMode)
    const auth = createAuth(env)
    const authContext = await auth.$context
    const organizationAdapter = getOrgAdapter(authContext as Parameters<typeof getOrgAdapter>[0], {})
    const organization = await organizationAdapter.findOrganizationById(request.input.organizationId)
    if (!organization) {
      throw new StripeProcessedInvoiceReplayError('organization_not_found', 404, 'Organization not found.')
    }

    const report = await reconcileOrganizationSubscription({
      db,
      stripe: createStripeClient(env.STRIPE_SECRET_KEY as string),
      adapter: authContext.adapter as unknown as Parameters<typeof reconcileOrganizationSubscription>[0]['adapter'],
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        stripeCustomerId: (organization as unknown as { stripeCustomerId?: string | null }).stripeCustomerId ?? null,
      },
      request: {
        organizationId: request.input.organizationId,
        providerMode: request.input.providerMode,
        expectedStripeAccountId: request.input.expectedStripeAccountId,
      },
      actor,
      providerModeVerified: true,
    })

    if (request.mode === 'preview') {
      return noStore(await previewStripeProcessedInvoiceReplay(
        db,
        env.BETTER_AUTH_SECRET,
        request.input,
        actor,
        report,
      ))
    }
    if (!request.expectedStateSha256 || !request.approvalToken) {
      throw new StripeProcessedInvoiceReplayError(
        'invalid_request',
        400,
        'Apply requires expectedStateSha256 and approvalToken.',
      )
    }
    return noStore(await applyStripeProcessedInvoiceReplay(
      db,
      env.BETTER_AUTH_SECRET,
      request.input,
      actor,
      report,
      request.expectedStateSha256,
      request.approvalToken,
    ))
  } catch (error) {
    if (error instanceof StripeProcessedInvoiceReplayError) {
      return noStore({ error: error.message, code: error.code }, error.statusCode)
    }
    if (error instanceof OrganizationSubscriptionReconciliationError) {
      return noStore({ error: error.message, code: error.code }, error.statusCode)
    }
    throw error
  }
})
