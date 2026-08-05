export interface SiteSubscribeSavedCard {
  brand: string
  last4: string
  exp_month: number
  exp_year: number
}

const PLAN_LABELS: Record<string, string> = {
  growth: 'Growth — $49/mo',
  managed: 'Managed — $149/mo',
  seo_accelerator: 'SEO Accelerator — $349/mo',
}

// Per-flow callback — keyed by a unique transaction ID so concurrent callers don't clobber each other
const _successHandlers = new Map<string, () => void>()

async function _redirectToCheckout(organizationId: string, siteId: string, plan: string) {
  const response = await authClient.subscription.upgrade({
    plan,
    referenceId: organizationId,
    customerType: 'organization',
    metadata: { site_id: siteId },
    successUrl: window.location.href,
    cancelUrl: window.location.href,
    disableRedirect: true,
  })
  if (response.error) throw new Error(response.error.message ?? 'Unable to start subscription checkout')
  const checkoutUrl = response.data && 'url' in response.data ? response.data.url : null
  if (!checkoutUrl) throw new Error('Missing checkout URL from Better Auth Stripe')
  await navigateTo(checkoutUrl, { external: true })
}

export const useSiteSubscribe = () => {
  const isOpen = useState<boolean>('site-subscribe:modal:open', () => false)
  const pendingSiteId = useState<string | null>('site-subscribe:modal:siteId', () => null)
  const pendingPlan = useState<string | null>('site-subscribe:modal:plan', () => null)
  const pendingTxId = useState<string | null>('site-subscribe:modal:txid', () => null)
  const savedCard = useState<SiteSubscribeSavedCard | null>('site-subscribe:modal:card', () => null)
  const subscribing = useState<boolean>('site-subscribe:modal:subscribing', () => false)

  const toast = useToast()
  const dashboard = useDashboardSite()

  const planLabel = computed(() => pendingPlan.value ? (PLAN_LABELS[pendingPlan.value] ?? pendingPlan.value) : '')

  // Better Auth Stripe owns the single organization subscription. The site is
  // metadata only; it never creates a second subscription or uses a saved-card
  // direct-charge path.
  async function offerSubscribe(siteId: string, plan: string, onSuccess?: () => void) {
    try {
      const organizationId = dashboard.organization.value?.id
      if (!organizationId) throw new Error('Organization context is unavailable')
      await _redirectToCheckout(organizationId, siteId, plan)
      onSuccess?.()
    } catch {
      toast.add({ title: 'Unable to start checkout — please try again', color: 'error' })
    }
  }

  async function confirm() {
    if (!pendingSiteId.value || !pendingPlan.value) return
    subscribing.value = true
    const siteId = pendingSiteId.value
    const plan = pendingPlan.value
    const txId = pendingTxId.value
    try {
      const organizationId = dashboard.organization.value?.id
      if (!organizationId) throw new Error('Organization context is unavailable')
      await _redirectToCheckout(organizationId, siteId, plan)
      isOpen.value = false
      pendingSiteId.value = null
      pendingPlan.value = null
      pendingTxId.value = null
      toast.add({ title: `Site subscribed to ${PLAN_LABELS[plan] ?? plan}`, color: 'success' })
      if (txId) {
        _successHandlers.get(txId)?.()
        _successHandlers.delete(txId)
      }
    } catch (err) {
      const data = (err as { data?: { requiresCheckout?: boolean } }).data
      isOpen.value = false
      pendingSiteId.value = null
      pendingPlan.value = null
      pendingTxId.value = null
      if (txId) _successHandlers.delete(txId)
      if (data?.requiresCheckout) {
        try {
          const organizationId = dashboard.organization.value?.id
          if (!organizationId) throw new Error('Organization context is unavailable')
          await _redirectToCheckout(organizationId, siteId, plan)
        } catch {
          toast.add({ title: 'Unable to start checkout — please try again', color: 'error' })
        }
      } else {
        toast.add({ title: 'Subscription failed. Please try again.', color: 'error' })
      }
    } finally {
      subscribing.value = false
    }
  }

  function cancel() {
    const txId = pendingTxId.value
    isOpen.value = false
    pendingSiteId.value = null
    pendingPlan.value = null
    pendingTxId.value = null
    if (txId) _successHandlers.delete(txId)
  }

  return { isOpen, pendingSiteId, pendingPlan, savedCard, subscribing, planLabel, offerSubscribe, confirm, cancel }
}
