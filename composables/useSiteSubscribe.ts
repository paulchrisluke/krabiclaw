import { authClient } from '~/lib/auth-client'

function checkoutReturnUrls(): { successUrl: string; cancelUrl: string } {
  const current = new URL(window.location.href)
  for (const key of ['success', 'canceled', 'plan']) current.searchParams.delete(key)

  const success = new URL(current)
  success.searchParams.set('success', 'true')
  const cancel = new URL(current)
  cancel.searchParams.set('canceled', 'true')
  return { successUrl: success.toString(), cancelUrl: cancel.toString() }
}

async function organizationSubscriptionId(
  dashboardApi: ReturnType<typeof useDashboardApi>,
  organizationId: string,
): Promise<string | undefined> {
  const response = await dashboardApi<{ billing?: { stripeSubscriptionId?: unknown } }>('/api/billing/status', {
    query: { organizationId },
    validate: value => typeof value === 'object' && value !== null,
  })
  return typeof response.billing?.stripeSubscriptionId === 'string'
    ? response.billing.stripeSubscriptionId
    : undefined
}

async function redirectToCheckout(
  organizationId: string,
  siteId: string,
  plan: string,
  subscriptionId?: string,
) {
  const { successUrl, cancelUrl } = checkoutReturnUrls()
  const response = await authClient.subscription.upgrade({
    plan,
    referenceId: organizationId,
    ...(subscriptionId ? { subscriptionId } : {}),
    customerType: 'organization',
    metadata: { site_id: siteId },
    successUrl,
    cancelUrl,
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

  // The organization owns one recurring subscription. A site is only
  // metadata on the upgrade request and receives derived entitlements after
  // Better Auth confirms the subscription through Stripe.
  async function offerSubscribe(siteId: string, plan: string) {
    try {
      const organizationId = dashboard.organization.value?.id
      if (!organizationId) throw new Error('Organization context is unavailable')
      const subscriptionId = await organizationSubscriptionId(dashboardApi, organizationId)
      await redirectToCheckout(organizationId, siteId, plan, subscriptionId)
    } catch {
      toast.add({ title: 'Unable to start checkout — please try again', color: 'error' })
    }
  }

  return { offerSubscribe }
}
