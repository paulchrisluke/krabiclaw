import { CREDIT_BUNDLES } from '~/shared/creditBundles'

export type CreditBundle = 500 | 2500 | 5000

export interface SavedCard {
  brand: string
  last4: string
  exp_month: number
  exp_year: number
}

const BUNDLE_LABELS = Object.fromEntries(CREDIT_BUNDLES.map(b => [b.credits, b.label])) as Record<CreditBundle, string>
const BUNDLE_PRICES = Object.fromEntries(CREDIT_BUNDLES.map(b => [b.credits, b.price])) as Record<CreditBundle, string>

// Per-flow callback — keyed by a unique transaction ID so concurrent callers don't clobber each other
const _successHandlers = new Map<string, (balance: number) => void>()

async function _redirectToCheckout(bundle: CreditBundle) {
  const res = await $fetch<{ checkoutUrl?: string }>('/api/billing/credits/add', {
    method: 'POST',
    body: { bundle },
  })
  if (!res.checkoutUrl) {
    throw new Error('Missing checkout URL from billing API')
  }
  await navigateTo(res.checkoutUrl, { external: true })
}

export const useCreditPurchase = () => {
  const isOpen = useState<boolean>('credits:modal:open', () => false)
  const pendingBundle = useState<CreditBundle | null>('credits:modal:bundle', () => null)
  const pendingTxId = useState<string | null>('credits:modal:txid', () => null)
  const savedCard = useState<SavedCard | null>('credits:modal:card', () => null)
  const paying = useState<boolean>('credits:modal:paying', () => false)
  const wantsAutoTopup = useState<boolean>('credits:modal:autotopup', () => false)

  const toast = useToast()

  const bundleLabel = computed(() =>
    pendingBundle.value ? BUNDLE_LABELS[pendingBundle.value] : ''
  )
  const bundlePrice = computed(() =>
    pendingBundle.value ? BUNDLE_PRICES[pendingBundle.value] : ''
  )

  async function purchase(bundle: CreditBundle, onSuccess?: (balance: number) => void) {
    try {
      const res = await $fetch<{ card: SavedCard | null }>('/api/billing/payment-method')
      if (res.card) {
        const txId = crypto.randomUUID()
        savedCard.value = res.card
        pendingBundle.value = bundle
        pendingTxId.value = txId
        isOpen.value = true
        if (onSuccess) _successHandlers.set(txId, onSuccess)
        return
      }
    } catch {
      // No saved card — fall through to Checkout
    }
    try {
      await _redirectToCheckout(bundle)
    } catch {
      toast.add({ title: 'Unable to start checkout — please try again', color: 'error' })
    }
  }

  async function confirm() {
    if (!pendingBundle.value) return
    paying.value = true
    const bundle = pendingBundle.value
    const txId = pendingTxId.value
    try {
      const res = await $fetch<{ balance: number; requiresCheckout?: boolean }>(
        '/api/billing/credits/charge',
        { method: 'POST', body: { bundle, txId, enableAutoTopup: wantsAutoTopup.value, autoTopupBundle: bundle } }
      )
      const balance = res.balance
      isOpen.value = false
      pendingBundle.value = null
      pendingTxId.value = null
      wantsAutoTopup.value = false
      toast.add({ title: `${bundle.toLocaleString()} credits added`, color: 'success' })
      if (txId) {
        _successHandlers.get(txId)?.(balance)
        _successHandlers.delete(txId)
      }
    } catch (err) {
      const data = (err as { data?: { requiresCheckout?: boolean } }).data
      isOpen.value = false
      pendingBundle.value = null
      pendingTxId.value = null
      if (txId) _successHandlers.delete(txId)
      if (data?.requiresCheckout) {
        try {
          await _redirectToCheckout(bundle)
        } catch {
          toast.add({ title: 'Unable to start checkout — please try again', color: 'error' })
        }
      } else {
        toast.add({ title: 'Payment failed. Please try again.', color: 'error' })
      }
    } finally {
      paying.value = false
    }
  }

  function cancel() {
    const txId = pendingTxId.value
    isOpen.value = false
    pendingBundle.value = null
    pendingTxId.value = null
    wantsAutoTopup.value = false
    if (txId) _successHandlers.delete(txId)
  }

  return { isOpen, pendingBundle, savedCard, paying, wantsAutoTopup, bundleLabel, bundlePrice, purchase, confirm, cancel }
}
