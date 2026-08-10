import { defineEventHandler, readBody, setResponseHeader } from 'h3'
import { getOrgAdapter } from 'better-auth/plugins'
import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { createAuth, getAuthSession } from '~/server/utils/auth'
import { createStripeClient } from '~/server/utils/stripe-client'
import { platformPermissionJsonResponse } from '~/server/utils/platform-admin-users'
import {
  assertOrganizationSubscriptionReconciliationOperatorSession,
  assertStripeProviderMode,
  OrganizationSubscriptionReconciliationError,
  parseOrganizationSubscriptionReconciliationRequest,
  reconcileOrganizationSubscription,
} from '~/server/utils/organization-subscription-reconciliation'
import { readDeploymentProvenance } from '~/server/utils/deployment-provenance'
import { OperatorSessionError } from '~/server/utils/operator-session'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const env = cloudflareEnv(event)
  const db = env.DB
  if (!db) return jsonResponse({ error: 'Database not available' }, { status: 500, headers: { 'cache-control': 'no-store' } })

  const permissionDenied = await platformPermissionJsonResponse(event, env, { platform: ['billing'] })
  if (permissionDenied) {
    permissionDenied.headers.set('cache-control', 'no-store')
    return permissionDenied
  }

  try {
    const session = await getAuthSession(event, env)
    const actor = assertOrganizationSubscriptionReconciliationOperatorSession(session)
    const request = parseOrganizationSubscriptionReconciliationRequest(await readBody<unknown>(event))

    // The mode guard is intentionally before Stripe client construction or any
    // provider request. A live key can never be used for a test report (or vice
    // versa), even if the caller supplied a plausible account id.
    assertStripeProviderMode(env.STRIPE_SECRET_KEY, request.providerMode)

    let provenance: { sourceSha: string; worker: { id: string } }
    try {
      provenance = readDeploymentProvenance(env.CF_VERSION_METADATA)
    } catch {
      throw new OrganizationSubscriptionReconciliationError(
        'deployment_provenance_unavailable',
        503,
        'Immutable deployment provenance is unavailable or malformed.',
      )
    }

    const auth = createAuth(env)
    const authContext = await auth.$context
    const organizationAdapter = getOrgAdapter(authContext as Parameters<typeof getOrgAdapter>[0], {})
    const organization = await organizationAdapter.findOrganizationById(request.organizationId)
    if (!organization) {
      throw new OrganizationSubscriptionReconciliationError('organization_not_found', 404, 'Organization not found.')
    }

    const stripe = createStripeClient(env.STRIPE_SECRET_KEY as string)
    const report = await reconcileOrganizationSubscription({
      db,
      stripe,
      adapter: authContext.adapter as unknown as Parameters<typeof reconcileOrganizationSubscription>[0]['adapter'],
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        stripeCustomerId: (organization as unknown as { stripeCustomerId?: string | null }).stripeCustomerId ?? null,
      },
      request,
      actor,
      sourceSha: provenance.sourceSha,
      workerVersionId: provenance.worker.id,
      providerModeVerified: true,
    })
    return jsonResponse(report, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    if (error instanceof OperatorSessionError) {
      return jsonResponse({ error: error.message, code: error.code }, { status: error.statusCode, headers: { 'cache-control': 'no-store' } })
    }
    if (error instanceof OrganizationSubscriptionReconciliationError) {
      return jsonResponse({ error: error.message, code: error.code }, { status: error.statusCode, headers: { 'cache-control': 'no-store' } })
    }
    throw error
  }
})
