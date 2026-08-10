<template>
  <UDashboardPanel id="admin-clients">
    <template #header>
      <UDashboardNavbar title="Clients">
        <template #leading>
          <DashboardSidebarCollapseButton />
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
            <p class="font-semibold text-highlighted">No paid clients yet</p>
            <p class="text-sm text-muted mt-1">Growth clients will appear here.</p>
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
                :aria-label="`Open ${client.brand_name || client.org_name} workspace`"
                :disabled="isImpersonatingClient || !client.impersonation_user_id"
                :loading="impersonatingClientOrgId === client.org_id"
                @click="openWorkspace(client)"
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
                <div v-if="billingStatus.pending_transfer.recipient_ready" class="space-y-2 px-4 py-2.5">
                  <label for="recipient-organization" class="block text-muted">Recipient organization</label>
                  <select
                    v-if="billingStatus.pending_transfer.recipient_organizations.length > 1"
                    id="recipient-organization"
                    v-model="selectedRecipientOrganizationId"
                    class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm text-default focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="" disabled>Select an organization</option>
                    <option v-for="organization in billingStatus.pending_transfer.recipient_organizations" :key="organization.id" :value="organization.id">
                      {{ organization.name }} ({{ organization.slug }})
                    </option>
                  </select>
                  <span v-else class="text-default">
                    {{ billingStatus.pending_transfer.recipient_organizations[0]?.name }}
                    <span class="text-muted">({{ billingStatus.pending_transfer.recipient_organizations[0]?.slug }})</span>
                  </span>
                </div>
              </div>
              <UAlert
                v-if="!billingStatus.pending_transfer.recipient_ready"
                color="warning"
                variant="soft"
                :description="billingStatus.pending_transfer.recipient_resolution === 'no_owned_organization'
                  ? 'The recipient has an account but does not own an organization yet. Ask them to create one before force accepting.'
                  : billingStatus.pending_transfer.recipient_resolution === 'ambiguous'
                    ? 'More than one exact recipient account matched. Reconcile the recipient identity before force accepting.'
                  : 'Ask them to click the transfer link and create an account first — then you can force accept.'"
              />
              <UAlert v-if="forceAcceptError" color="error" variant="soft" :description="forceAcceptError" />
              <UAlert v-if="forceAcceptResult" color="success" variant="soft" :title="`Site transferred to ${forceAcceptResult.to_email}`" description="They can now access it in their dashboard." />
              <UButton
                v-if="billingStatus.pending_transfer.recipient_ready && !forceAcceptResult"
                block
                color="success"
                :loading="forceAccepting"
                :disabled="!selectedRecipientOrganizationId"
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
import { NEW_SALE_PAID_PLAN_IDS } from '~/shared/billing-model'

definePageMeta({ layout: 'dashboard' })
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
  impersonation_user_id: string | null
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
    recipient_resolution: 'missing' | 'ambiguous' | 'no_owned_organization' | 'ready'
    recipient_organizations: Array<{
      id: string
      name: string
      slug: string
    }>
  } | null
}

const validateBillingStatusBase = validateApiShape<BillingStatus>({
  org_name: 'string',
  org_slug: 'nullable-string',
  stripe_customer_id: 'nullable-string',
  stripe_subscription_id: 'nullable-string',
  plan: 'nullable-string',
  status: 'nullable-string',
  current_period_end: 'nullable-string',
  sites_billing: {
    arrayOf: {
      site_id: 'string',
      brand_name: 'nullable-string',
      stripe_subscription_id: 'nullable-string',
      plan: 'nullable-string',
      status: 'nullable-string',
      current_period_end: 'nullable-string',
      cancel_at_period_end: 'boolean',
    },
  },
  cancel_at_period_end: 'boolean',
  pending_transfer: 'nullable-object',
})

const validatePendingTransfer = validateApiShape<NonNullable<BillingStatus['pending_transfer']>>({
  id: 'string',
  site_id: 'string',
  to_email: 'string',
  invited_plan: 'nullable-string',
  invited_interval: 'string',
  invited_domain: 'nullable-string',
  requires_payment: 'boolean',
  created_at: 'string',
  brand_name: 'nullable-string',
  recipient_ready: 'boolean',
  recipient_resolution: 'string',
  recipient_organizations: {
    arrayOf: {
      id: 'string',
      name: 'string',
      slug: 'string',
    },
  },
})

const isTransferRecipientResolution = (value: unknown): value is NonNullable<BillingStatus['pending_transfer']>['recipient_resolution'] => value === 'missing'
  || value === 'ambiguous'
  || value === 'no_owned_organization'
  || value === 'ready'

const validateBillingStatus = (value: unknown): value is BillingStatus => (
  validateBillingStatusBase(value)
  && (value.pending_transfer === null
    || (validatePendingTransfer(value.pending_transfer)
      && isTransferRecipientResolution(value.pending_transfer.recipient_resolution)
      && (value.pending_transfer.recipient_ready
        ? value.pending_transfer.recipient_resolution === 'ready'
          && value.pending_transfer.recipient_organizations.length > 0
        : value.pending_transfer.recipient_resolution !== 'ready'
          && value.pending_transfer.recipient_organizations.length === 0)))
)

const clients = ref<Client[]>([])
const clientsLoading = ref(true)
const impersonatingClientOrgId = ref<string | null>(null)
const isImpersonatingClient = computed(() => impersonatingClientOrgId.value !== null)
const { refreshSession } = useAuth()

const PLAN_LABELS: Record<string, string> = {
  growth: 'Growth',
}
const PLAN_COLORS: Record<string, 'primary' | 'success' | 'warning'> = {
  growth: 'warning',
}

function planLabel(plan: string) { return PLAN_LABELS[plan] ?? 'Unsupported plan' }
function planColor(plan: string) { return PLAN_COLORS[plan] ?? 'neutral' }

async function loadClients() {
  clientsLoading.value = true
  try {
    const res = await applicationFetch<{ clients: Client[] }>('/api/admin/clients', {
      validate: validateApiShape({ clients: 'array' }),
    })
    clients.value = res.clients
  } catch {
    toast.add({ title: 'Failed to load clients', color: 'error' })
  } finally {
    clientsLoading.value = false
  }
}

async function openWorkspace(client: Client) {
  if (isImpersonatingClient.value) return

  if (!client.org_slug || !client.impersonation_user_id) {
    toast.add({ title: 'No client workspace member available', color: 'warning' })
    return
  }

  impersonatingClientOrgId.value = client.org_id
  try {
    const { authClient } = await import('~/lib/auth-client')
    const result = await authClient.admin.impersonateUser({ userId: client.impersonation_user_id })
    if (result.error) throw new Error(result.error.message)
    await refreshSession()
    await navigateTo(`/dashboard/${client.org_slug}`)
  } catch {
    toast.add({ title: 'Failed to enter client workspace', color: 'error' })
  } finally {
    impersonatingClientOrgId.value = null
  }
}

// ── Billing modal ────────────────────────────────────────────────────────────
const billingOpen = ref(false)
const billingClient = ref<Client | null>(null)
const billingStatus = ref<BillingStatus | null>(null)
const billingLoading = ref(false)
const billingError = ref('')

const forceAccepting = ref(false)
const forceAcceptResult = ref<{ success: boolean; to_email: string } | null>(null)
const forceAcceptError = ref('')
const selectedRecipientOrganizationId = ref('')

function setSelectedRecipientOrganization(status: BillingStatus | null) {
  const organizations = status?.pending_transfer?.recipient_organizations ?? []
  selectedRecipientOrganizationId.value = organizations.length === 1 ? organizations[0]!.id : ''
}

async function openBilling(client: Client) {
  billingClient.value = client
  billingStatus.value = null
  billingError.value = ''
  forceAcceptResult.value = null
  forceAcceptError.value = ''
  selectedRecipientOrganizationId.value = ''
  billingOpen.value = true
  billingLoading.value = true
  try {
    billingStatus.value = await applicationFetch<BillingStatus>(`/api/admin/organizations/${client.org_id}/billing`, {
      validate: validateBillingStatus,
    })
    setSelectedRecipientOrganization(billingStatus.value)
  } catch (err: unknown) {
    billingError.value = getErrorMessage(err, 'Failed to load billing info')
  } finally {
    billingLoading.value = false
  }
}

async function forceAcceptTransfer() {
  if (!billingStatus.value?.pending_transfer?.site_id) return
  if (!selectedRecipientOrganizationId.value) {
    forceAcceptError.value = 'Select the recipient organization before force accepting.'
    return
  }
  forceAccepting.value = true
  forceAcceptResult.value = null
  forceAcceptError.value = ''
  try {
    const res = await applicationFetch<{ success: boolean; to_email: string }>(
      `/api/admin/sites/${billingStatus.value.pending_transfer.site_id}/transfer/force-accept`,
      {
        method: 'POST',
        validate: validateApiShape({ success: 'boolean', to_email: 'string' }),
        body: {
          organizationId: selectedRecipientOrganizationId.value,
        },
      },
    )
    forceAcceptResult.value = res
    await loadClients()
    billingStatus.value = await applicationFetch<BillingStatus>(`/api/admin/organizations/${billingClient.value!.org_id}/billing`, {
      validate: validateBillingStatus,
    })
    setSelectedRecipientOrganization(billingStatus.value)
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
  ...NEW_SALE_PAID_PLAN_IDS.map(plan => ({ label: 'Growth — $49/mo', value: plan })),
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
    const res = await applicationFetch<HandoffResult>(`/api/admin/sites/${handoffClient.value.site_id}/transfer`, {
      method: 'POST',
      validate: validateApiShape({
        transfer_url: 'string',
        to_email: 'string',
        site_name: 'string',
        invited_plan: 'nullable-string',
      }),
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
