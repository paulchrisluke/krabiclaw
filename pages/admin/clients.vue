<template>
  <UDashboardPanel id="admin-clients">
    <template #header>
      <UDashboardNavbar title="Clients">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <UButton color="neutral" variant="ghost" size="xs" :loading="clientsLoading" @click="loadClients">
            <UIcon name="i-lucide-refresh-cw" class="size-4" />
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UCard v-if="clientsLoading">
          <div class="space-y-3">
            <USkeleton v-for="i in 4" :key="i" class="h-16 rounded-lg" />
          </div>
        </UCard>

        <UCard v-else-if="clients.length === 0">
          <div class="text-center">
            <UIcon name="i-lucide-store" class="mx-auto size-10 text-muted mb-3" />
            <p class="font-semibold text-highlighted">No managed clients yet</p>
            <p class="text-sm text-muted mt-1">Clients on Growth, Managed, or SEO Accelerator will appear here.</p>
          </div>
        </UCard>

        <div v-else class="divide-y divide-default rounded-xl border border-default overflow-hidden">
          <div
            v-for="client in clients"
            :key="client.org_id"
            class="flex items-center justify-between gap-4 px-5 py-4 bg-default hover:bg-elevated/50 transition-colors"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <UIcon name="i-lucide-store" class="size-4" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="font-semibold text-default truncate">{{ client.brand_name || client.org_name }}</p>
                  <UBadge :label="planLabel(client.plan)" :color="planColor(client.plan)" variant="soft" size="xs" />
                </div>
                <p class="text-sm text-muted">
                  <span v-if="client.subdomain">{{ client.subdomain }}.krabiclaw.com</span>
                  <span v-else class="italic opacity-50">No subdomain</span>
                  <template v-if="client.source_locale"> · {{ client.source_locale }}</template>
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <UButton
                v-if="client.org_slug"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-languages"
                :to="`/dashboard/${client.org_slug}/translations`"
                target="_blank"
              >
                Translations
              </UButton>
              <UButton
                v-if="client.site_id"
                size="xs"
                color="success"
                variant="soft"
                icon="i-lucide-send"
                @click="openHandoff(client)"
              >
                Send Handoff
              </UButton>
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-credit-card"
                @click="openBilling(client)"
              >
                Billing
              </UButton>
              <UButton
                v-if="client.org_slug"
                size="xs"
                color="primary"
                variant="soft"
                icon="i-lucide-external-link"
                :to="`/dashboard/${client.org_slug}`"
                target="_blank"
              >
                Workspace
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Send Handoff modal -->
  <UModal v-model:open="handoffOpen" :ui="{ content: 'max-w-lg' }">
    <template #content>
      <div class="p-6 space-y-5">
        <div>
          <h3 class="text-lg font-semibold text-highlighted">Send Handoff</h3>
          <p class="text-sm text-muted mt-0.5">
            {{ handoffClient?.brand_name || handoffClient?.org_name }} — invite your client to claim ownership.
          </p>
        </div>

        <template v-if="!handoffResult">
          <div class="space-y-4">
            <UFormField label="Client email" required>
              <UInput v-model="handoffEmail" type="email" placeholder="owner@restaurant.com" class="w-full" />
            </UFormField>

            <UFormField label="Their domain (optional)">
              <UInput v-model="handoffDomain" placeholder="potteryhouse.com" class="w-full" />
              <template #help>If you enter a domain here, choose a paid plan too. The client must complete checkout before ownership transfers.</template>
            </UFormField>
            <p v-if="handoffDomainNeedsPlan" class="text-sm text-error -mt-2">
              A paid plan is required when inviting a client with a custom domain.
            </p>

            <UFormField label="Plan to invite them to">
              <USelect v-model="handoffPlan" :items="PLAN_OPTIONS" class="w-full" />
            </UFormField>

            <UFormField label="Stripe coupon code (optional)">
              <UInput v-model="handoffCoupon" placeholder="e.g. FRIEND50" class="w-full" />
              <template #help>Applied automatically at checkout. Use the coupon ID from your Stripe dashboard.</template>
            </UFormField>

            <UFormField label="Personal note (optional)">
              <UTextarea v-model="handoffMessage" placeholder="Your website is ready — I think you'll love it!" :rows="3" class="w-full" />
            </UFormField>
          </div>

          <p v-if="handoffError" class="text-sm text-error">{{ handoffError }}</p>

          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" color="neutral" @click="handoffOpen = false">Cancel</UButton>
            <UButton
              color="primary"
              :loading="handoffSending"
              :disabled="!handoffEmail.trim() || handoffDomainNeedsPlan"
              icon="i-lucide-send"
              @click="sendHandoff"
            >
              Send invite email
            </UButton>
          </div>
        </template>

        <template v-else>
          <UAlert
            color="success"
            variant="soft"
            icon="i-lucide-circle-check"
            :title="`Invite sent to ${handoffResult.to_email}`"
            :description="handoffResult.invited_plan ? `Plan: ${handoffResult.invited_plan} — checkout happens before ownership transfers.` : 'No plan attached — ownership transfers as soon as they claim it.'"
          />

          <div>
            <p class="text-sm font-medium text-highlighted mb-2">Transfer link</p>
            <div class="flex gap-2">
              <UInput :model-value="handoffResult.transfer_url" readonly class="flex-1 font-mono text-xs" />
              <UButton color="neutral" variant="soft" icon="i-lucide-copy" @click="copyHandoffLink">Copy</UButton>
              <UButton
                color="success"
                variant="soft"
                icon="i-lucide-message-circle"
                :href="`https://wa.me/?text=${encodeURIComponent('Hi! Your website is ready — claim it here: ' + handoffResult.transfer_url)}`"
                target="_blank"
              >
                WhatsApp
              </UButton>
            </div>
            <p class="text-xs text-muted mt-2">An invite email was also sent automatically. This handoff link stays active until it is completed or cancelled.</p>
          </div>

          <div class="flex justify-end">
            <UButton variant="ghost" color="neutral" @click="handoffOpen = false">Close</UButton>
          </div>
        </template>
      </div>
    </template>
  </UModal>

  <!-- Billing modal -->
  <UModal v-model:open="billingOpen" :ui="{ content: 'max-w-lg' }">
    <template #content>
      <div class="p-6 space-y-5">
        <div>
          <h3 class="text-lg font-semibold text-highlighted">Billing</h3>
          <p class="text-sm text-muted mt-0.5">{{ billingClient?.brand_name || billingClient?.org_name }}</p>
        </div>

        <div v-if="billingLoading" class="space-y-2">
          <USkeleton v-for="i in 4" :key="i" class="h-8 rounded" />
        </div>

        <template v-else-if="billingError">
          <UAlert color="error" variant="soft" :description="billingError" />
        </template>

        <template v-else-if="billingStatus">
          <!-- Current subscription status -->
          <div class="rounded-xl border border-default divide-y divide-default text-sm">
            <div class="flex justify-between px-4 py-2.5">
              <span class="text-muted">Plan</span>
              <UBadge v-if="billingStatus.plan" :label="planLabel(billingStatus.plan)" :color="planColor(billingStatus.plan)" variant="soft" size="xs" />
              <span v-else class="text-muted italic">None</span>
            </div>
            <div class="flex justify-between px-4 py-2.5">
              <span class="text-muted">Status</span>
              <UBadge :label="billingStatus.status ?? 'not set'" :color="billingStatus.status === 'active' ? 'success' : 'neutral'" variant="soft" size="xs" />
            </div>
            <div class="flex justify-between px-4 py-2.5">
              <span class="text-muted">Renews</span>
              <span class="text-default">{{ billingStatus.current_period_end ? formatDate(billingStatus.current_period_end) : '—' }}</span>
            </div>
            <div class="flex justify-between items-center px-4 py-2.5">
              <span class="text-muted">Stripe customer</span>
              <a
                v-if="billingStatus.stripe_customer_id"
                :href="`https://dashboard.stripe.com/customers/${billingStatus.stripe_customer_id}`"
                target="_blank"
                class="font-mono text-xs text-primary hover:underline flex items-center gap-1"
              >
                {{ billingStatus.stripe_customer_id }}
                <UIcon name="i-lucide-external-link" class="size-3" />
              </a>
              <span v-else class="text-muted italic text-xs">Not created</span>
            </div>
            <div class="flex justify-between items-center px-4 py-2.5">
              <span class="text-muted">Subscription</span>
              <a
                v-if="billingStatus.stripe_subscription_id"
                :href="`https://dashboard.stripe.com/subscriptions/${billingStatus.stripe_subscription_id}`"
                target="_blank"
                class="font-mono text-xs text-primary hover:underline flex items-center gap-1"
              >
                {{ billingStatus.stripe_subscription_id }}
                <UIcon name="i-lucide-external-link" class="size-3" />
              </a>
              <span v-else class="text-muted italic text-xs">None</span>
            </div>
          </div>

          <!-- Mark month paid (active cash subs only) -->
          <template v-if="billingStatus.status === 'active' && billingStatus.sites_billing?.some(s => s.site_id === billingClient?.site_id && s.payment_method === 'cash')">
            <div class="border-t border-default pt-4 space-y-3">
              <p class="text-sm font-semibold text-highlighted">Mark month paid</p>
              <p class="text-xs text-muted">
                Collected cash in person? Finalize the outstanding Stripe invoice and advance the billing period.
              </p>
              <UAlert v-if="markPaidError" color="error" variant="soft" :description="markPaidError" />
              <UAlert v-if="markPaidResult" color="success" variant="soft" :title="`Period advanced to ${markPaidResult.new_period_end ? new Date(markPaidResult.new_period_end).toLocaleDateString() : 'N/A'}`" description="Invoice marked paid. Next reminder will fire closer to the new due date." />
              <UButton v-if="!markPaidResult" block color="success" :loading="markPaying" icon="i-lucide-circle-check" @click="markMonthPaid">
                Mark this month paid
              </UButton>
            </div>
          </template>

          <!-- Record cash payment (only if not already active) -->
          <template v-if="billingStatus.status !== 'active'">
            <div class="border-t border-default pt-4 space-y-3">
              <p class="text-sm font-semibold text-highlighted">Record cash payment</p>
              <div class="flex gap-2">
                <USelect v-model="cashPlan" :items="CASH_PLAN_OPTIONS" class="flex-1" size="sm" />
                <USelect
                  v-model="cashInterval"
                  :items="[{ label: 'Monthly', value: 'month' }, { label: 'Annual', value: 'year' }]"
                  size="sm"
                  class="w-32"
                />
              </div>
              <div class="flex gap-2">
                <UInputNumber v-model="cashLocalRate" placeholder="Rate (e.g. 1500)" :min="0" size="sm" class="flex-1" />
                <UInput v-model="cashLocalCurrency" placeholder="Currency (e.g. THB)" size="sm" class="w-28" />
              </div>
              <p class="text-xs text-muted">Local rate + currency power the billing reminder emails.</p>
              <UAlert v-if="cashError" color="error" variant="soft" :description="cashError" />
              <UAlert v-if="cashResult" color="success" variant="soft" :title="`Payment recorded — ${cashResult.plan} ${cashResult.interval}ly`" :description="`$${(cashResult.amount_paid / 100).toFixed(2)} collected. Entitlements are now active.`" />
              <UButton v-if="!cashResult" block color="primary" :loading="cashPaying" icon="i-lucide-banknote" @click="recordCashPayment">
                Record cash payment
              </UButton>
            </div>
          </template>

          <!-- Pending transfer section -->
          <template v-if="billingStatus.pending_transfer">
            <div class="border-t border-default pt-4 space-y-3">
              <p class="text-sm font-semibold text-highlighted">Pending transfer</p>
              <div class="rounded-xl border border-default divide-y divide-default text-sm">
                <div class="flex justify-between px-4 py-2.5">
                  <span class="text-muted">Recipient</span>
                  <span class="text-default">{{ billingStatus.pending_transfer.to_email }}</span>
                </div>
                <div class="flex justify-between px-4 py-2.5">
                  <span class="text-muted">Has account</span>
                  <UBadge :label="billingStatus.pending_transfer.recipient_ready ? 'Yes' : 'Not yet'" :color="billingStatus.pending_transfer.recipient_ready ? 'success' : 'warning'" variant="soft" size="xs" />
                </div>
              </div>
              <UAlert v-if="!billingStatus.pending_transfer.recipient_ready" color="warning" variant="soft" description="Ask them to click the transfer link and create an account first — then you can force accept." />
              <UAlert v-if="forceAcceptError" color="error" variant="soft" :description="forceAcceptError" />
              <UAlert v-if="forceAcceptResult" color="success" variant="soft" :title="`Site transferred to ${forceAcceptResult.to_email}`" description="They can now access it in their dashboard." />
              <UButton
                v-if="billingStatus.pending_transfer.recipient_ready && !forceAcceptResult"
                block
                color="success"
                :loading="forceAccepting"
                icon="i-lucide-send"
                @click="forceAcceptTransfer"
              >
                Force transfer site now
              </UButton>
            </div>
          </template>
        </template>

        <div class="flex justify-end pt-2">
          <UButton variant="ghost" color="neutral" @click="billingOpen = false">Close</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { getErrorMessage } from '~/utils/errors'

definePageMeta({ layout: 'dashboard', middleware: 'admin' })
useSeoMeta({ title: 'Clients | KrabiClaw Admin', robots: 'noindex, nofollow' })

const toast = useToast()

interface Client {
  org_id: string
  org_name: string
  org_slug: string | null
  plan: string
  site_id: string | null
  brand_name: string | null
  subdomain: string | null
  source_locale: string | null
  subscription_status: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  pending_transfer_email: string | null
}

interface BillingStatus {
  org_name: string
  org_slug: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan: string | null
  status: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  sites_billing: Array<{
    site_id: string
    brand_name: string | null
    stripe_subscription_id: string | null
    plan: string | null
    status: string | null
    current_period_end: string | null
    cancel_at_period_end: boolean
    payment_method: string
    local_rate: number | null
    local_currency: string | null
  }>
  pending_transfer: {
    id: string
    site_id: string
    to_email: string
    invited_plan: string | null
    invited_interval: string
    invited_domain: string | null
    requires_payment: boolean
    created_at: string
    brand_name: string | null
    recipient_ready: boolean
  } | null
}

const clients = ref<Client[]>([])
const clientsLoading = ref(false)

const PLAN_LABELS: Record<string, string> = {
  growth: 'Growth',
  managed: 'Managed',
  seo_accelerator: 'SEO Accelerator',
}
const PLAN_COLORS: Record<string, 'primary' | 'success' | 'warning'> = {
  growth: 'warning',
  managed: 'primary',
  seo_accelerator: 'success',
}

function planLabel(plan: string) { return PLAN_LABELS[plan] ?? plan }
function planColor(plan: string) { return PLAN_COLORS[plan] ?? 'neutral' }

async function loadClients() {
  clientsLoading.value = true
  try {
    const res = await $fetch<{ clients: Client[] }>('/api/admin/clients')
    clients.value = res.clients
  } catch {
    toast.add({ title: 'Failed to load clients', color: 'error' })
  } finally {
    clientsLoading.value = false
  }
}

// ── Billing modal ────────────────────────────────────────────────────────────
const billingOpen = ref(false)
const billingClient = ref<Client | null>(null)
const billingStatus = ref<BillingStatus | null>(null)
const billingLoading = ref(false)
const billingError = ref('')

const cashPlan = ref('growth')
const cashInterval = ref<'month' | 'year'>('year')
const cashLocalRate = ref<number | null>(null)
const cashLocalCurrency = ref('THB')
const cashPaying = ref(false)
const cashResult = ref<{ success: boolean; plan: string; interval: string; amount_paid: number } | null>(null)
const cashError = ref('')

const markPaying = ref(false)
const markPaidResult = ref<{ success: boolean; new_period_end: string | null } | null>(null)
const markPaidError = ref('')
const selectedCashSiteId = ref<string | null>(null)

const forceAccepting = ref(false)
const forceAcceptResult = ref<{ success: boolean; to_email: string } | null>(null)
const forceAcceptError = ref('')

const CASH_PLAN_OPTIONS = [
  { label: 'Growth — $49/mo · $588/yr', value: 'growth' },
  { label: 'Managed — $149/mo · $1,788/yr', value: 'managed' },
  { label: 'SEO Accelerator — $349/mo · $4,188/yr', value: 'seo_accelerator' },
]

async function openBilling(client: Client) {
  billingClient.value = client
  billingStatus.value = null
  billingError.value = ''
  cashResult.value = null
  cashError.value = ''
  markPaidResult.value = null
  markPaidError.value = ''
  forceAcceptResult.value = null
  forceAcceptError.value = ''
  selectedCashSiteId.value = client.site_id
  cashPlan.value = client.plan !== 'free' ? client.plan : 'growth'
  cashInterval.value = 'year'
  cashLocalRate.value = null
  cashLocalCurrency.value = 'THB'
  billingOpen.value = true
  billingLoading.value = true
  try {
    billingStatus.value = await $fetch<BillingStatus>(`/api/admin/organizations/${client.org_id}/billing`)
  } catch (err: unknown) {
    billingError.value = getErrorMessage(err, 'Failed to load billing info')
  } finally {
    billingLoading.value = false
  }
}

async function recordCashPayment() {
  if (!billingClient.value) return
  if (cashLocalRate.value === null || cashLocalRate.value === undefined || cashLocalRate.value <= 0) {
    cashError.value = 'Please enter a valid positive rate'
    return
  }
  cashPaying.value = true
  cashResult.value = null
  cashError.value = ''
  try {
    const res = await $fetch<{ success: boolean; plan: string; interval: string; amount_paid: number }>(
      `/api/admin/organizations/${billingClient.value.org_id}/billing/cash-payment`,
      {
        method: 'POST',
        body: {
          plan: cashPlan.value,
          interval: cashInterval.value,
          siteId: billingClient.value?.site_id,
          localRate: cashLocalRate.value ?? undefined,
          localCurrency: cashLocalCurrency.value || undefined,
        },
      },
    )
    cashResult.value = res
    await loadClients()
    billingStatus.value = await $fetch<BillingStatus>(`/api/admin/organizations/${billingClient.value.org_id}/billing`)
  } catch (err: unknown) {
    cashError.value = getErrorMessage(err, 'Failed to record payment')
  } finally {
    cashPaying.value = false
  }
}

async function markMonthPaid() {
  const siteId = billingClient.value?.site_id
  if (!siteId) return
  markPaying.value = true
  markPaidResult.value = null
  markPaidError.value = ''
  try {
    const res = await $fetch<{ success: boolean; new_period_end: string | null }>(
      `/api/admin/sites/${siteId}/billing/mark-paid`,
      { method: 'POST' },
    )
    markPaidResult.value = res
    await loadClients()
    if (billingClient.value) {
      billingStatus.value = await $fetch<BillingStatus>(`/api/admin/organizations/${billingClient.value.org_id}/billing`)
    }
  } catch (err: unknown) {
    markPaidError.value = getErrorMessage(err, 'Failed to mark payment')
  } finally {
    markPaying.value = false
  }
}

async function forceAcceptTransfer() {
  if (!billingStatus.value?.pending_transfer?.site_id) return
  forceAccepting.value = true
  forceAcceptResult.value = null
  forceAcceptError.value = ''
  try {
    const res = await $fetch<{ success: boolean; to_email: string }>(
      `/api/admin/sites/${billingStatus.value.pending_transfer.site_id}/transfer/force-accept`,
      { method: 'POST' },
    )
    forceAcceptResult.value = res
    await loadClients()
    billingStatus.value = await $fetch<BillingStatus>(`/api/admin/organizations/${billingClient.value!.org_id}/billing`)
  } catch (err: unknown) {
    forceAcceptError.value = getErrorMessage(err, 'Failed to transfer site')
  } finally {
    forceAccepting.value = false
  }
}

// ── Handoff modal ────────────────────────────────────────────────────────────
interface HandoffResult {
  transfer_url: string
  to_email: string
  site_name: string
  invited_plan: string | null
}

const handoffOpen = ref(false)
const handoffClient = ref<Client | null>(null)
const handoffEmail = ref('')
const handoffMessage = ref('')
const handoffPlan = ref('')
const handoffCoupon = ref('')
const handoffDomain = ref('')
const handoffSending = ref(false)
const handoffResult = ref<HandoffResult | null>(null)
const handoffError = ref('')

const PLAN_OPTIONS = [
  { label: 'No plan (they choose later)', value: '' },
  { label: 'Growth — $49/mo', value: 'growth' },
  { label: 'Managed — $149/mo', value: 'managed' },
  { label: 'SEO Accelerator — $349/mo', value: 'seo_accelerator' },
]

const handoffDomainNeedsPlan = computed(() => Boolean(handoffDomain.value.trim()) && !handoffPlan.value)

function openHandoff(client: Client) {
  handoffClient.value = client
  handoffEmail.value = ''
  handoffMessage.value = ''
  handoffPlan.value = ''
  handoffCoupon.value = ''
  handoffDomain.value = ''
  handoffResult.value = null
  handoffError.value = ''
  handoffOpen.value = true
}

async function sendHandoff() {
  if (!handoffClient.value?.site_id || !handoffEmail.value.trim()) return
  if (handoffDomainNeedsPlan.value) {
    handoffError.value = 'A paid plan is required when inviting a client with a custom domain.'
    return
  }
  handoffSending.value = true
  handoffError.value = ''
  handoffResult.value = null
  try {
    const res = await $fetch<HandoffResult>(`/api/admin/sites/${handoffClient.value.site_id}/transfer`, {
      method: 'POST',
      body: {
        email: handoffEmail.value.trim(),
        message: handoffMessage.value.trim() || undefined,
        plan: handoffPlan.value || undefined,
        coupon: handoffCoupon.value.trim() || undefined,
        domain: handoffDomain.value.trim() || undefined,
      },
    })
    handoffResult.value = res
  } catch (err: unknown) {
    handoffError.value = getErrorMessage(err, 'Failed to send handoff')
  } finally {
    handoffSending.value = false
  }
}

async function copyHandoffLink() {
  if (!handoffResult.value?.transfer_url) return
  try {
    await navigator.clipboard.writeText(handoffResult.value.transfer_url)
    toast.add({ title: 'Link copied', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to copy', color: 'error' })
  }
}

onMounted(loadClients)
</script>
