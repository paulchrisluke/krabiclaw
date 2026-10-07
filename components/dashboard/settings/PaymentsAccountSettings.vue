<template>
  <!--
    Airbnb's Payments tab, the same for an account and a business: "Your
    payments" with Manage payments, then, for a business, "Payment methods" —
    the cards on the Stripe customer Better Auth keeps for it, each with Set
    default / Remove, and Add payment method opening Stripe's own card form in a sheet.
  -->
  <div class="space-y-12">
    <section>
      <h2 class="text-xl font-semibold text-highlighted">Your payments</h2>
      <p class="mt-1 text-base text-muted">Keep track of all your payments and refunds.</p>
      <UButton class="mt-6" size="lg" label="Manage payments" :to="paymentsTo" />
    </section>

    <!-- A buyer's cards are saved with each business, in that business's Stripe Checkout; only a business keeps cards here, for its own billing. -->
    <section v-if="!personalScope">
      <h2 class="text-xl font-semibold text-highlighted">Payment methods</h2>
      <p class="mt-1 text-base text-muted">Add and manage your payment methods using our secure payment system.</p>
      <UAlert v-if="error" class="mt-6" color="error" variant="soft" :description="getErrorMessage(error, 'Payment methods could not be loaded')" />
      <template v-else-if="data">
        <div v-if="data.payment_methods.length" class="mt-6 divide-y divide-default border-y border-default">
          <div v-for="method in data.payment_methods" :key="method.id" class="flex items-center gap-4 py-5" :data-testid="`payment-method-${method.id}`">
            <span class="flex h-9 w-14 shrink-0 items-center justify-center rounded-md bg-elevated text-xs font-semibold uppercase text-highlighted ring ring-default">{{ brandLabel(method.brand) }}</span>
            <span class="min-w-0 flex-1">
              <span class="block text-base font-medium text-highlighted">{{ brandLabel(method.brand) }} {{ method.last4 }}<UBadge v-if="method.default" label="Default" color="neutral" variant="soft" class="ml-2" /></span>
              <span class="block text-sm text-muted">Expiration: {{ String(method.exp_month).padStart(2, '0') }}/{{ method.exp_year }}</span>
            </span>
            <UDropdownMenu :items="methodItems(method)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" square :aria-label="`Options for ${brandLabel(method.brand)} ${method.last4}`" />
            </UDropdownMenu>
          </div>
        </div>
        <p v-else class="mt-6 text-base text-muted">No payment methods saved yet.</p>
        <UButton class="mt-6" size="lg" label="Add payment method" :loading="opening" @click="openCardForm" />
      </template>
      <UAlert v-if="failure" class="mt-4" color="error" variant="soft" :description="failure" />
    </section>

    <!-- Airbnb's "Add card details": Stripe's card form, Cancel and Done. -->
    <DashboardListItemDialog v-model:open="adding" title="Add card details" :saving="saving" :save-disabled="!ready" :error="formError" save-label="Done" @save="confirmCard">
      <div ref="mount" class="min-h-40" />
    </DashboardListItemDialog>
  </div>
</template>

<script setup lang="ts">
import { loadStripe, type Stripe, type StripeElements, type StripePaymentElement } from '@stripe/stripe-js'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
import type { PaymentMethodRow } from '~/server/utils/billing-customer'

const props = defineProps<{ /** The account's own cards, instead of the business's. */ personalScope?: boolean }>()

type Methods = { payment_methods: PaymentMethodRow[] }
const isMethods = (value: unknown): value is Methods => isRecord(value) && Array.isArray(value.payment_methods)
  && value.payment_methods.every(row => isRecord(row) && typeof row.id === 'string' && typeof row.brand === 'string' && typeof row.last4 === 'string' && Number.isSafeInteger(row.exp_month) && Number.isSafeInteger(row.exp_year) && typeof row.default === 'boolean')

const route = useRoute()
const dashboard = useDashboardOrganization()
const level = useRouteLevel()
const config = useRuntimeConfig()
const organizationId = computed(() => props.personalScope ? null : dashboard.organization.value?.id ?? null)
const scope = computed(() => organizationId.value ? { organizationId: organizationId.value } : {})
// The account's history is its ledger leaf; the business's is its invoices, under Plan.
const paymentsTo = computed(() => props.personalScope ? `${level.path.value}/your-payments` : `/dashboard/${encodeURIComponent(String(route.params.orgSlug))}/settings/payments/invoices`)

const { data, error, refresh } = await useAsyncData(
  () => `payment-methods:${props.personalScope ? 'account' : String(route.params.orgSlug)}`,
  () => applicationFetch<Methods>('/api/billing/payment-methods', { query: scope.value, validate: isMethods }),
  { immediate: !props.personalScope },
)
const failure = ref('')
const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover', jcb: 'JCB', unionpay: 'UnionPay', diners: 'Diners' }
const brandLabel = (brand: string) => BRANDS[brand] ?? brand
const methodItems = (method: PaymentMethodRow) => [[
  ...(method.default ? [] : [{ label: 'Set default', icon: 'i-lucide-check', onSelect: () => void act('set_default', method.id) }]),
  { label: 'Remove', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => void act('remove', method.id) },
]]
async function act(action: 'set_default' | 'remove', paymentMethodId: string) {
  failure.value = ''
  try {
    await applicationFetch('/api/billing/payment-methods', {
      method: action === 'remove' ? 'DELETE' : 'POST',
      body: { ...scope.value, ...(action === 'remove' ? {} : { action }), payment_method_id: paymentMethodId },
      validate: (value: unknown): value is Record<string, unknown> => isRecord(value),
    })
    await refresh()
  } catch (cause) {
    failure.value = getErrorMessage(cause, action === 'remove' ? 'The payment method could not be removed' : 'The default could not be changed')
  }
}

// Stripe's form lives in the sheet: a SetupIntent from the server, Elements mounted when the sheet opens, confirmed on Done.
const adding = ref(false)
const opening = ref(false)
const saving = ref(false)
const ready = ref(false)
const formError = ref('')
const mount = ref<HTMLElement | null>(null)
let stripe: Stripe | null = null
let elements: StripeElements | null = null
let paymentElement: StripePaymentElement | null = null
async function openCardForm() {
  if (opening.value) return
  opening.value = true
  failure.value = ''
  formError.value = ''
  ready.value = false
  try {
    const key = String(config.public.stripePublishableKey ?? '')
    if (!key) throw new Error('Card entry is not configured')
    const [loaded, setup] = await Promise.all([
      stripe ? Promise.resolve(stripe) : loadStripe(key),
      applicationFetch<{ client_secret: string }>('/api/billing/payment-methods', { method: 'POST', body: { ...scope.value, action: 'setup' }, validate: (value: unknown): value is { client_secret: string } => isRecord(value) && typeof value.client_secret === 'string' }),
    ])
    if (!loaded) throw new Error('Stripe could not be loaded')
    stripe = loaded
    adding.value = true
    await nextTick()
    if (!mount.value) throw new Error('The card form has nowhere to mount')
    elements = stripe.elements({ clientSecret: setup.client_secret, appearance: { theme: document.documentElement.classList.contains('dark') ? 'night' : 'stripe' } })
    paymentElement = elements.create('payment', { layout: 'tabs' })
    paymentElement.on('ready', () => { ready.value = true })
    paymentElement.mount(mount.value)
  } catch (cause) {
    adding.value = false
    failure.value = getErrorMessage(cause, 'The card form could not be opened')
  } finally {
    opening.value = false
  }
}
async function confirmCard() {
  if (!stripe || !elements || saving.value) return
  saving.value = true
  formError.value = ''
  try {
    const result = await stripe.confirmSetup({ elements, redirect: 'if_required', confirmParams: { return_url: window.location.href } })
    if (result.error) throw new Error(result.error.message ?? 'The card was not saved')
    adding.value = false
    await refresh()
  } catch (cause) {
    formError.value = getErrorMessage(cause, 'The card was not saved')
  } finally {
    saving.value = false
  }
}
watch(adding, (open) => { if (!open) { paymentElement?.destroy(); paymentElement = null; elements = null; ready.value = false } })
</script>
