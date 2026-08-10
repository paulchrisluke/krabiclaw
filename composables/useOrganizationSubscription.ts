import { authClient } from '~/lib/auth-client'
import { isKnownBillingPlan } from '~/shared/billing-model'

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
): Promise<{ id?: string; status: string; plan: string }> {
  type BillingStatusResponse = {
    success: true
    billing: {
      stripeSubscriptionId?: string
      subscriptionStatus: string
      plan: string
    }
  }
  const response = await dashboardApi<BillingStatusResponse>('/api/billing/status', {
    query: { organizationId },
    validate: (value): value is BillingStatusResponse => {
      if (typeof value !== 'object' || value === null || !('success' in value) || value.success !== true || !('billing' in value)) return false
      const billing = value.billing
      return typeof billing === 'object'
        && billing !== null
        && (!('stripeSubscriptionId' in billing) || billing.stripeSubscriptionId === undefined || typeof billing.stripeSubscriptionId === 'string')
        && 'subscriptionStatus' in billing
        && typeof billing.subscriptionStatus === 'string'
        && 'plan' in billing
        && isKnownBillingPlan(billing.plan)
    },
  })
  return {
    id: response.billing.stripeSubscriptionId,
    status: response.billing.subscriptionStatus,
    plan: response.billing.plan,
  }
}

export const useOrganizationSubscription = () => {
  const toast = useToast()
  const dashboard = useDashboardSite()
  const dashboardApi = useDashboardApi()
  const { trackSubscriptionUpgrade, trackSubscriptionDowngrade } = useAnalytics()
  const { startSubscriptionCheckout } = useSubscriptionCheckout()

  // The organization owns one recurring subscription. A site is only
  // metadata on the upgrade request and receives derived entitlements after
  // Better Auth confirms the subscription through Stripe.
  async function startOrganizationCheckout(siteId: string, plan: string) {
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
      const currentPlan = subscription.plan
      await startSubscriptionCheckout({
        organizationId,
        siteId,
        plan,
        currentPlan,
        subscriptionId: subscription.id,
        onAction: action => {
          if (action === 'upgrade') trackSubscriptionUpgrade(plan)
          if (action === 'downgrade' && plan !== 'free') trackSubscriptionDowngrade(plan)
        },
      })
    } catch (err) {
      console.error('Checkout error:', err)
      toast.add({ title: 'Unable to start checkout — please try again', color: 'error' })
    }
  }

  return { startOrganizationCheckout }
}
