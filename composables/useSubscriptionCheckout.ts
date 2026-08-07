import { authClient } from '~/lib/auth-client'
import { buildStripeSubscriptionMetadata, classifyStripePlanChange, type StripeGa4IntentAction } from '~/shared/stripe-ga4'

interface SubscriptionCheckoutInput {
  organizationId: string
  siteId: string
  plan: string
  currentPlan: string
  subscriptionId?: string | null
  annual?: boolean
  previousPriceId?: string | null
  newPriceId?: string | null
  onAction?: (_action: StripeGa4IntentAction) => void
}

function checkoutReturnUrls(): { successUrl: string; cancelUrl: string; returnUrl: string } {
  const current = new URL(window.location.href)
  for (const key of ['success', 'canceled', 'plan']) current.searchParams.delete(key)

  const success = new URL(current)
  success.searchParams.set('success', 'true')
  const cancel = new URL(current)
  cancel.searchParams.set('canceled', 'true')
  return { successUrl: success.toString(), cancelUrl: cancel.toString(), returnUrl: current.toString() }
}

export function useSubscriptionCheckout() {
  const dashboardApi = useDashboardApi()
  const { data: sessionData } = useAuth()
  const { getBillingAnalyticsContext } = useAnalytics()

  async function startSubscriptionCheckout(input: SubscriptionCheckoutInput): Promise<StripeGa4IntentAction> {
    const { successUrl, cancelUrl, returnUrl } = checkoutReturnUrls()
    const action = classifyStripePlanChange(input.currentPlan, input.plan, Boolean(input.subscriptionId))
    if (!action) throw new Error('The selected plan is already active')
    input.onAction?.(action)

    const analyticsContext = getBillingAnalyticsContext()
    try {
      await recordBillingAnalyticsIntent(dashboardApi, {
        organizationId: input.organizationId,
        siteId: input.siteId,
        subscriptionId: input.subscriptionId ?? null,
        action,
        ...analyticsContext,
        previousPriceId: input.previousPriceId ?? null,
        newPriceId: input.newPriceId ?? null,
        effectiveTiming: action === 'downgrade' ? 'period_end' : 'immediate',
      })
    } catch (error) {
      console.warn('Billing analytics intent was not recorded; continuing checkout', error)
    }

    const metadata = {
      site_id: input.siteId,
      ...buildStripeSubscriptionMetadata(
        action,
        analyticsContext,
        sessionData.value?.user?.id,
        input.previousPriceId,
        input.newPriceId,
      ),
    }

    if (action === 'downgrade' && input.plan === 'free') {
      if (!input.subscriptionId) throw new Error('No active subscription to cancel')
      const cancelResponse = await authClient.subscription.cancel({
        referenceId: input.organizationId,
        subscriptionId: input.subscriptionId,
        customerType: 'organization',
        returnUrl,
        disableRedirect: true,
      })
      if (cancelResponse.error) throw new Error(cancelResponse.error.message ?? 'Unable to open cancellation flow')
      const portalUrl = cancelResponse.data && 'url' in cancelResponse.data ? cancelResponse.data.url : null
      if (!portalUrl) throw new Error('Missing billing cancellation URL')
      await navigateTo(portalUrl, { external: true })
      return action
    }

    const response = await authClient.subscription.upgrade({
      plan: input.plan,
      annual: input.annual ?? false,
      referenceId: input.organizationId,
      ...(input.subscriptionId ? { subscriptionId: input.subscriptionId } : {}),
      customerType: 'organization',
      metadata,
      ...(action === 'downgrade' ? { scheduleAtPeriodEnd: true } : {}),
      successUrl,
      cancelUrl,
      returnUrl,
      disableRedirect: true,
    })
    if (response.error) throw new Error(response.error.message ?? 'Unable to start subscription checkout')
    const checkoutUrl = response.data && 'url' in response.data ? response.data.url : null
    if (!checkoutUrl) throw new Error('Missing checkout URL from Better Auth Stripe')
    await navigateTo(checkoutUrl, { external: true })
    return action
  }

  return { startSubscriptionCheckout }
}
