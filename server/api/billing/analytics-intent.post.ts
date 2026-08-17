import { HTTPError, defineHandler  } from 'nitro';

import { cloudflareEnv, jsonResponse } from '~/server/utils/api-response'
import { queryFirst } from '~/server/db'
import { getAuthSession } from '~/server/utils/auth'
import { getOrganizationBillingStatus, getStripe, requireBillingAccess } from '~/server/utils/billing'
import { resolveRequestedOrganization } from '~/server/utils/dashboard-context'
import {
  buildStripeSubscriptionMetadata, isStripeGa4IntentAction, type StripeGa4IntentAction, } from '~/shared/stripe-ga4'
import { recordStripeGa4Intent } from '~/server/utils/stripe-ga4-intents'

interface AnalyticsIntentRequest {
  organizationId?: string
  siteId?: string
  subscriptionId?: string | null
  action?: string
  gaClientId?: string | null
  gaSessionId?: string | null
  gaSessionCapturedAt?: number | null
  previousPriceId?: string | null
  newPriceId?: string | null
  effectiveTiming?: 'immediate' | 'period_end'
  source?: 'browser' | 'server'
}

function optionalString(value: unknown, maxLength = 255): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null
}

async function updateStripeAttribution(
  env: ReturnType<typeof cloudflareEnv>, organizationId: string, userId: string, body: AnalyticsIntentRequest, action: StripeGa4IntentAction, ): Promise<void> {
  if (!env.STRIPE_SECRET_KEY) throw new HTTPError({ statusCode: 503, statusMessage: 'Stripe not configured' })
  const subscriptionId = optionalString(body.subscriptionId)
  const stripe = getStripe(env)
  const subscription = subscriptionId
    ? await stripe.subscriptions.retrieve(subscriptionId)
    : null
  const customerId = subscription
    ? (typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? null)
    : (await queryFirst<{ stripeCustomerId: string | null }>(env.DB, `
        SELECT stripe_customer_id AS stripeCustomerId
          FROM organization_billing WHERE organization_id = ? LIMIT 1
      `, [organizationId]))?.stripeCustomerId ?? null
  const contextMetadata: Record<string, string> = buildStripeSubscriptionMetadata(action, {
    gaClientId: optionalString(body.gaClientId), gaSessionId: optionalString(body.gaSessionId, 64), gaSessionCapturedAt: body.gaSessionCapturedAt, }, userId, optionalString(body.previousPriceId), optionalString(body.newPriceId))
  if (action !== 'initial_subscription') {
    contextMetadata.pending_change_type = action
    contextMetadata.pending_user_id = userId
    if (contextMetadata.ga_client_id) contextMetadata.pending_ga_client_id = contextMetadata.ga_client_id
    if (contextMetadata.ga_session_id) contextMetadata.pending_ga_session_id = contextMetadata.ga_session_id
    if (contextMetadata.ga_session_captured_at) contextMetadata.pending_ga_session_captured_at = contextMetadata.ga_session_captured_at
  }

  if (subscription) {
    await stripe.subscriptions.update(subscription.id, {
      metadata: { ...subscription.metadata, ...contextMetadata }, })
  }
  if (customerId) {
    const customer = await stripe.customers.retrieve(customerId)
    if (!customer.deleted) {
      await stripe.customers.update(customerId, {
        metadata: {
          ...customer.metadata, user_id: userId, ...(contextMetadata.ga_client_id ? { ga_client_id: contextMetadata.ga_client_id } : {}), }, })
    }
  }
}

export default defineHandler(async (event) => {
  const body = await readBody<AnalyticsIntentRequest>(event)
  const env = cloudflareEnv(event)
  if (!env.DB) throw new HTTPError({ statusCode: 503, statusMessage: 'Database unavailable' })

  const session = await getAuthSession(event, env)
  if (!session?.user?.id) return jsonResponse({ error: 'Authentication required' }, { status: 401 })
  if (!body?.organizationId || !body.siteId || !isStripeGa4IntentAction(body.action)) {
    return jsonResponse({ error: 'organizationId, siteId, and a valid action are required' }, { status: 400 })
  }
  if (body.effectiveTiming && body.effectiveTiming !== 'immediate' && body.effectiveTiming !== 'period_end') {
    return jsonResponse({ error: 'Invalid effective timing' }, { status: 400 })
  }
  if (body.source && body.source !== 'browser' && body.source !== 'server') {
    return jsonResponse({ error: 'Invalid intent source' }, { status: 400 })
  }

  const organization = await resolveRequestedOrganization(event, env.DB, session.user.id, {
    explicitOrganizationId: body.organizationId, })
  if (!organization) return jsonResponse({ error: 'Organization not found' }, { status: 404 })
  try {
    await requireBillingAccess(env, env.DB, organization.id, session.user.id)
  } catch {
    return jsonResponse({ error: 'Only organization owners can manage billing' }, { status: 403 })
  }

  const site = await queryFirst<{ id: string }>(env.DB, `
    SELECT id FROM sites WHERE id = ? AND organization_id = ? LIMIT 1
  `, [body.siteId, organization.id])
  if (!site) return jsonResponse({ error: 'Site not found or does not belong to this organization' }, { status: 404 })

  const subscriptionId = optionalString(body.subscriptionId)
  if (subscriptionId) {
    const billingStatus = await getOrganizationBillingStatus(env, env.DB, organization.id)
    if (billingStatus.stripeSubscriptionId !== subscriptionId) return jsonResponse({ error: 'Subscription does not belong to this organization' }, { status: 400 })
  }

  const action = body.action as StripeGa4IntentAction
  if (action !== 'initial_subscription' && !subscriptionId) {
    return jsonResponse({ error: 'An existing subscription is required for an upgrade or downgrade intent' }, { status: 400 })
  }
  if (action === 'initial_subscription' && subscriptionId) {
    return jsonResponse({ error: 'Initial subscription intents cannot reference an existing subscription' }, { status: 400 })
  }
  if (action !== 'downgrade' && body.effectiveTiming === 'period_end') {
    return jsonResponse({ error: 'Only downgrades can be scheduled at period end' }, { status: 400 })
  }
  const clientId = optionalString(body.gaClientId)
  const sessionId = optionalString(body.gaSessionId, 64)
  const sessionCapturedAt = typeof body.gaSessionCapturedAt === 'number'
    && Number.isSafeInteger(body.gaSessionCapturedAt)
    && body.gaSessionCapturedAt > 0
    ? body.gaSessionCapturedAt
    : null

  await updateStripeAttribution(env, organization.id, session.user.id, body, action)
  const intent = await recordStripeGa4Intent(env.DB, {
    organizationId: organization.id, userId: session.user.id, stripeSubscriptionId: subscriptionId, action, siteId: body.siteId, clientId, sessionId, sessionCapturedAt, previousPriceId: optionalString(body.previousPriceId), newPriceId: optionalString(body.newPriceId), effectiveTiming: body.effectiveTiming, source: body.source ?? 'browser', })
  return jsonResponse({ success: true, intentId: intent.id })
})
import { readBody } from 'nitro/h3';
