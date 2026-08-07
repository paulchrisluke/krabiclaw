import { authClient } from '~/lib/auth-client'
import { classifyStripePlanChange } from '~/shared/stripe-ga4'

function checkoutReturnUrls(): { successUrl: string; cancelUrl: string; returnUrl: string } {
  const current = new URL(window.location.href)
  for (const key of ['success', 'canceled', 'plan']) current.searchParams.delete(key)

  const success = new URL(current)
  success.searchParams.set('success', 'true')
  const cancel = new URL(current)
  cancel.searchParams.set('canceled', 'true')
  return { successUrl: success.toString(), cancelUrl: cancel.toString(), returnUrl: current.toString() }
}

async function organizationSubscriptionId(
  dashboardApi: ReturnType<typeof useDashboardApi>,
  organizationId: string,
): Promise<{ id?: string; status?: string; plan?: string }> {
  const response = await dashboardApi<{ billing?: { stripeSubscriptionId?: unknown; subscriptionStatus?: unknown; plan?: unknown } }>('/api/billing/status', {
    query: { organizationId },
    validate: value => typeof value === 'object' && value !== null,
  })
  return {
    id: typeof response.billing?.stripeSubscriptionId === 'string' ? response.billing.stripeSubscriptionId : undefined,
    status: typeof response.billing?.subscriptionStatus === 'string' ? response.billing.subscriptionStatus : undefined,
    plan: typeof response.billing?.plan === 'string' ? response.billing.plan : undefined,
  }
}

async function redirectToCheckout(
  organizationId: string,
  siteId: string,
  plan: string,
  currentPlan: string,
  subscriptionId?: string,
  dashboardApi?: ReturnType<typeof useDashboardApi>,
) {
  const { successUrl, cancelUrl, returnUrl } = checkoutReturnUrls()
  const { getBillingAnalyticsContext } = useAnalytics()
  const analyticsContext = getBillingAnalyticsContext()
  const action = classifyStripePlanChange(currentPlan, plan, Boolean(subscriptionId))
  if (!action) throw new Error('The selected plan is already active')
  if (dashboardApi) {
    await recordBillingAnalyticsIntent(dashboardApi, {
      organizationId,
      siteId,
      subscriptionId: subscriptionId ?? null,
      action,
      ...analyticsContext,
      effectiveTiming: action === 'downgrade' ? 'period_end' : 'immediate',
    })
  }
  const { data: sessionData } = useAuth()
  const metadata = {
    site_id: siteId,
    ...buildStripeSubscriptionMetadata(action, analyticsContext, sessionData.value?.user?.id),
  }
  if (action === 'downgrade' && plan === 'free' && subscriptionId) {
    const cancelResponse = await authClient.subscription.cancel({
      referenceId: organizationId,
      subscriptionId,
      customerType: 'organization',
      returnUrl,
      disableRedirect: true,
    })
    if (cancelResponse.error) throw new Error(cancelResponse.error.message ?? 'Unable to open cancellation flow')
    const portalUrl = cancelResponse.data && 'url' in cancelResponse.data ? cancelResponse.data.url : null
    if (!portalUrl) throw new Error('Missing billing cancellation URL')
    await navigateTo(portalUrl, { external: true })
    return
  }
  const response = await authClient.subscription.upgrade({
    plan,
    referenceId: organizationId,
    ...(subscriptionId ? { subscriptionId } : {}),
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
}

export const useSiteSubscribe = () => {
  const toast = useToast()
  const dashboard = useDashboardSite()
  const dashboardApi = useDashboardApi()
  const { trackSubscriptionUpgrade, trackSubscriptionDowngrade } = useAnalytics()

  // The organization owns one recurring subscription. A site is only
  // metadata on the upgrade request and receives derived entitlements after
  // Better Auth confirms the subscription through Stripe.
  async function offerSubscribe(siteId: string, plan: string) {
    try {
      const organizationId = dashboard.organization.value?.id
      if (!organizationId) throw new Error('Organization context is unavailable')
      const subscription = await organizationSubscriptionId(dashboardApi, organizationId)
      const { returnUrl } = checkoutReturnUrls()
      if (subscription.status === 'past_due') {
        const portal = await authClient.subscription.billingPortal({
          referenceId: organizationId,
          customerType: 'organization',
          returnUrl,
          disableRedirect: true,
        })
        if (portal.error) throw new Error(portal.error.message ?? 'Unable to open billing portal')
        const portalUrl = portal.data && 'url' in portal.data ? portal.data.url : null
        if (!portalUrl) throw new Error('Missing billing portal URL')
        await navigateTo(portalUrl, { external: true })
        return
      }
      const currentPlan = subscription.plan ?? 'free'
      const action = classifyStripePlanChange(currentPlan, plan, Boolean(subscription.id))
      if (action === 'upgrade') trackSubscriptionUpgrade(plan)
      if (action === 'downgrade' && plan !== 'free') trackSubscriptionDowngrade(plan)
      await redirectToCheckout(organizationId, siteId, plan, currentPlan, subscription.id, dashboardApi)
    } catch (err) {
      console.error('Checkout error:', err)
      toast.add({ title: 'Unable to start checkout — please try again', color: 'error' })
    }
  }

  return { offerSubscribe }
}
