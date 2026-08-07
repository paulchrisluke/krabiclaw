import { authClient } from '~/lib/auth-client'

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

export const useSiteSubscribe = () => {
  const toast = useToast()
  const dashboard = useDashboardSite()
  const dashboardApi = useDashboardApi()
  const { trackSubscriptionUpgrade, trackSubscriptionDowngrade } = useAnalytics()
  const { startSubscriptionCheckout } = useSubscriptionCheckout()

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

  return { offerSubscribe }
}
