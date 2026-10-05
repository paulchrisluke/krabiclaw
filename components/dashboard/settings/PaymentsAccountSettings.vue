<template>
  <!--
    Airbnb's Payments tab: "Your payments" with the history, then "Payment
    methods" with the cards. What the business pays the platform — the plan
    and the Payments fees — on the customer Better Auth keeps at Stripe.
  -->
  <div class="space-y-12">
    <UAlert v-if="error" color="error" variant="soft" :description="getErrorMessage(error, 'Payments could not be loaded')" />
    <template v-if="personalScope">
      <section>
        <h2 class="text-xl font-semibold text-highlighted">Your payments</h2>
        <p class="mt-1 text-base text-muted">Keep track of all your payments and refunds.</p>
        <UButton class="mt-6" size="lg" color="neutral" label="Manage payments" to="/dashboard/account/activity" />
      </section>
      <section>
        <h2 class="text-xl font-semibold text-highlighted">Payment methods</h2>
        <p class="mt-1 text-base text-muted">Cards you kept when paying a business. They’re stored by Stripe and offered the next time you pay that business.</p>
        <USkeleton v-if="personalPending && !personal" class="mt-6 h-24 rounded-2xl" />
        <template v-else-if="personal">
          <div v-for="group in personal.groups" :key="group.stripe_account_id" class="mt-6">
            <p class="flex items-center gap-3 text-base font-semibold text-highlighted">
              <UAvatar :src="group.organization_image_url ?? undefined" :alt="group.organization_name" :text="group.organization_name.slice(0, 1)" size="sm" class="rounded-lg" />{{ group.organization_name }}
            </p>
            <div class="mt-2 divide-y divide-default border-y border-default">
              <div v-for="method in group.methods" :key="method.id" class="flex items-center gap-4 py-5">
                <span class="flex h-9 w-14 shrink-0 items-center justify-center rounded-md bg-elevated text-xs font-semibold uppercase text-highlighted ring ring-default">{{ brandLabel(method.brand) }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-base font-medium text-highlighted">{{ brandName(method.brand) }} {{ method.last4 }}</span>
                  <span class="block text-sm text-muted">Expiration: {{ String(method.exp_month).padStart(2, '0') }}/{{ method.exp_year }}</span>
                </span>
                <UDropdownMenu :items="[[{ label: 'Remove', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => removeMethod(group.stripe_account_id, method.id) }]]" :content="{ align: 'end' }">
                  <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" square :aria-label="`Options for ${brandName(method.brand)} ${method.last4}`" />
                </UDropdownMenu>
              </div>
            </div>
          </div>
          <p v-if="!personal.groups.length" class="mt-6 text-base text-muted">No payment methods saved yet. A card you pay with is kept for next time.</p>
        </template>
        <UAlert v-if="failure" class="mt-4" color="error" variant="soft" :description="failure" />
      </section>
    </template>
    <section v-if="!personalScope">
      <h2 class="text-xl font-semibold text-highlighted">Your payments</h2>
      <p class="mt-1 text-base text-muted">Keep track of all your payments and refunds.</p>
      <USkeleton v-if="pending && !data" class="mt-6 h-40 rounded-2xl" />
      <template v-else-if="data">
        <div v-if="shownInvoices.length" class="mt-6 overflow-hidden rounded-2xl ring ring-default">
          <component
            :is="row.url ? 'a' : 'div'"
            v-for="row in shownInvoices"
            :key="row.id"
            :href="row.url ?? undefined"
            :target="row.url ? '_blank' : undefined"
            rel="noopener noreferrer"
            class="flex items-center gap-4 border-t border-default px-4 py-4 first:border-t-0 hover:bg-elevated"
          >
            <span class="min-w-0 flex-1 truncate text-base text-highlighted">{{ row.description }}</span>
            <span class="hidden shrink-0 text-sm text-muted sm:block">{{ formatCalendarDate(row.created_at.slice(0, 10), 'en', { month: 'short', day: 'numeric', year: 'numeric' }) }}</span>
            <UBadge :label="statusLabel(row.status)" :color="row.status === 'paid' ? 'neutral' : row.status === 'open' ? 'warning' : 'error'" variant="soft" />
            <span class="shrink-0 text-base font-medium tabular-nums text-highlighted">{{ paymentMoney(row.total, row.currency) }}</span>
            <UIcon v-if="row.url" name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
          </component>
        </div>
        <p v-else class="mt-6 text-base text-muted">{{ data.configured ? 'No payments yet.' : 'Payments appear here once you choose a plan.' }}</p>
        <UButton v-if="data.invoices.length > shownInvoices.length" class="mt-4" color="neutral" variant="soft" label="View all" @click="showAll = true" />
      </template>
    </section>

    <section v-if="!personalScope">
      <h2 class="text-xl font-semibold text-highlighted">Payment methods</h2>
      <p class="mt-1 text-base text-muted">Add and manage your payment methods using our secure payment system.</p>
      <USkeleton v-if="pending && !data" class="mt-6 h-24 rounded-2xl" />
      <template v-else-if="data">
        <div v-if="data.payment_methods.length" class="mt-6 divide-y divide-default border-y border-default">
          <div v-for="method in data.payment_methods" :key="method.id" class="flex items-center gap-4 py-5">
            <span class="flex h-9 w-14 shrink-0 items-center justify-center rounded-md bg-elevated text-xs font-semibold uppercase text-highlighted ring ring-default">{{ brandLabel(method.brand) }}</span>
            <span class="min-w-0 flex-1">
              <span class="block text-base font-medium text-highlighted">{{ brandName(method.brand) }} {{ method.last4 }}<UBadge v-if="method.default" label="Default" color="neutral" variant="soft" class="ml-2" /></span>
              <span class="block text-sm text-muted">Expiration: {{ String(method.exp_month).padStart(2, '0') }}/{{ method.exp_year }}</span>
            </span>
          </div>
        </div>
        <p v-else class="mt-6 text-base text-muted">No payment methods saved yet.</p>
        <UButton v-if="data.configured" class="mt-6" size="lg" label="Add payment method" :loading="opening" @click="addMethod" />
        <UAlert v-if="failure" class="mt-4" color="error" variant="soft" :description="failure" />
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { BillingInvoiceRow, BillingPaymentMethodRow } from '~/server/api/billing/history.get'
import { paymentMoney } from '~/shared/payment-display'
import { isCurrencyCode } from '~/shared/currencies'
import { formatCalendarDate } from '~/utils/timezone'
import type { BuyerPaymentMethodGroup } from '~/server/api/account/payment-methods.get'

const props = defineProps<{ /** The account's own cards, kept per business, instead of the business's platform billing. */ personalScope?: boolean }>()

type History = { configured: boolean; invoices: BillingInvoiceRow[]; payment_methods: BillingPaymentMethodRow[] }
const isHistory = (value: unknown): value is History => isRecord(value) && typeof value.configured === 'boolean'
  && Array.isArray(value.invoices) && value.invoices.every(row => isRecord(row) && typeof row.id === 'string' && typeof row.created_at === 'string' && typeof row.status === 'string' && Number.isSafeInteger(row.total) && isCurrencyCode(row.currency) && typeof row.description === 'string' && (row.url === null || typeof row.url === 'string'))
  && Array.isArray(value.payment_methods) && value.payment_methods.every(row => isRecord(row) && typeof row.id === 'string' && typeof row.brand === 'string' && typeof row.last4 === 'string' && Number.isSafeInteger(row.exp_month) && Number.isSafeInteger(row.exp_year) && typeof row.default === 'boolean')

const route = useRoute()
const api = useDashboardApi()
const dashboard = useDashboardOrganization()
const { data, pending, error: historyError } = await useAsyncData(() => `billing-history:${route.params.orgSlug}`, () => props.personalScope ? Promise.resolve(null) : api<History>('/api/billing/history', { validate: isHistory }), { lazy: true })
type Personal = { groups: BuyerPaymentMethodGroup[] }
const isPersonal = (value: unknown): value is Personal => isRecord(value) && Array.isArray(value.groups) && value.groups.every(group => isRecord(group) && typeof group.stripe_account_id === 'string' && typeof group.organization_name === 'string' && (group.organization_image_url === null || typeof group.organization_image_url === 'string') && Array.isArray(group.methods))
const { data: personal, pending: personalPending, error: personalError, refresh: refreshPersonal } = await useAsyncData('account-payment-methods', () => props.personalScope ? applicationFetch<Personal>('/api/account/payment-methods', { validate: isPersonal }) : Promise.resolve(null), { lazy: true })
const error = computed(() => historyError.value ?? personalError.value)
async function removeMethod(stripeAccountId: string, paymentMethodId: string) {
  failure.value = ''
  try {
    await applicationFetch('/api/account/payment-methods', { method: 'DELETE', body: { stripe_account_id: stripeAccountId, payment_method_id: paymentMethodId }, validate: (value: unknown): value is { removed: true } => isRecord(value) && value.removed === true })
    await refreshPersonal()
  } catch (cause) {
    failure.value = getErrorMessage(cause, 'The payment method could not be removed')
  }
}
const showAll = ref(false)
const shownInvoices = computed(() => showAll.value ? (data.value?.invoices ?? []) : (data.value?.invoices ?? []).slice(0, 4))
const statusLabel = (status: string) => status === 'paid' ? 'Paid' : status === 'open' ? 'Due' : status === 'uncollectible' ? 'Unpaid' : status
const brandName = (brand: string) => ({ visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', jcb: 'JCB', unionpay: 'UnionPay', diners: 'Diners Club' })[brand] ?? brand
const brandLabel = (brand: string) => brand === 'american_express' || brand === 'amex' ? 'Amex' : brandName(brand).slice(0, 6)

const opening = ref(false)
const failure = ref('')
async function addMethod() {
  if (opening.value) return
  opening.value = true
  failure.value = ''
  try {
    const portal = await api<{ url: string }>('/api/billing/portal', { method: 'POST', body: { organizationId: dashboard.organization.value?.id, flow: 'payment_method_update' }, validate: (value: unknown): value is { url: string } => isRecord(value) && typeof value.url === 'string' })
    await navigateTo(portal.url, { external: true })
  } catch (cause) {
    failure.value = getErrorMessage(cause, 'The card form could not be opened')
  } finally {
    opening.value = false
  }
}
</script>
