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

async function _redirectToCheckout(siteId: string, plan: string) {
  const res = await $fetch<{ checkoutUrl?: string }>('/api/billing/checkout', {
    method: 'POST',
    body: { siteId, plan },
  })
  if (!res.checkoutUrl) {
    throw new Error('Missing checkout URL from billing API')
  }
  await navigateTo(res.checkoutUrl, { external: true })
}

export const useSiteSubscribe = () => {
  const isOpen = useState<boolean>('site-subscribe:modal:open', () => false)
  const pendingSiteId = useState<string | null>('site-subscribe:modal:siteId', () => null)
  const pendingPlan = useState<string | null>('site-subscribe:modal:plan', () => null)
  const pendingTxId = useState<string | null>('site-subscribe:modal:txid', () => null)
  const savedCard = useState<SiteSubscribeSavedCard | null>('site-subscribe:modal:card', () => null)
  const subscribing = useState<boolean>('site-subscribe:modal:subscribing', () => false)

  const toast = useToast()

  const planLabel = computed(() => pendingPlan.value ? (PLAN_LABELS[pendingPlan.value] ?? pendingPlan.value) : '')

  // Offers to subscribe a newly created site to the same plan another site in
  // the org is already on. Shows a confirm modal if a saved card exists,
  // otherwise falls back to Stripe Checkout.
  async function offerSubscribe(siteId: string, plan: string, onSuccess?: () => void) {
    try {
      const res = await $fetch<{ card: SiteSubscribeSavedCard | null }>('/api/billing/payment-method')
      if (res.card) {
        const txId = crypto.randomUUID()
        savedCard.value = res.card
        pendingSiteId.value = siteId
        pendingPlan.value = plan
        pendingTxId.value = txId
        isOpen.value = true
        if (onSuccess) _successHandlers.set(txId, onSuccess)
        return
      }
    } catch {
      // No saved card — fall through to Checkout
    }
    try {
      await _redirectToCheckout(siteId, plan)
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
      await $fetch('/api/billing/site-subscribe', {
        method: 'POST',
        body: { siteId, plan, txId },
      })
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
          await _redirectToCheckout(siteId, plan)
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
