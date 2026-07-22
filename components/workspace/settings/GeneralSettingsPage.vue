<template>
  <UDashboardPanel id="org-settings-general">
    <template #header>
      <UDashboardNavbar title="General">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid gap-4 lg:grid-cols-2">
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">Profile</h2>
          </template>

          <div class="flex items-center gap-4">
            <UAvatar
              :src="sessionData?.user?.image ?? undefined"
              :text="getInitials(sessionData?.user?.name || sessionData?.user?.email)"
              alt="User avatar"
              size="lg"
            />
            <div class="min-w-0">
              <p class="truncate font-medium text-highlighted">{{ sessionData?.user?.name }}</p>
              <p class="truncate text-sm text-muted">{{ sessionData?.user?.email }}</p>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">Organization</h2>
          </template>

          <div v-if="organization" class="space-y-3">
            <div>
              <p class="text-sm text-muted">Name</p>
              <p class="mt-1 font-medium text-highlighted">{{ organization.name }}</p>
            </div>
            <div>
              <p class="text-sm text-muted">Role</p>
              <p class="mt-1 font-medium capitalize text-highlighted">{{ organizationRole }}</p>
            </div>
          </div>

          <p v-else class="text-sm text-muted">No organization found.</p>
        </UCard>

        <UCard class="lg:col-span-2">
          <template #header>
            <h2 class="font-semibold text-highlighted">Workspace Boundaries</h2>
          </template>

          <div class="grid gap-4 md:grid-cols-3">
            <div>
              <p class="font-medium text-highlighted">Organization</p>
              <p class="mt-1 text-sm text-muted">Billing, connected accounts, team ownership.</p>
            </div>
            <div>
              <p class="font-medium text-highlighted">Website</p>
              <p class="mt-1 text-sm text-muted">Brand, domain, theme, SEO defaults.</p>
            </div>
            <div>
              <p class="font-medium text-highlighted">Location</p>
              <p class="mt-1 text-sm text-muted">Address, hours, local menu, Google Business mapping.</p>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">Facebook and Instagram</h2>
                <p class="mt-1 text-sm text-muted">Site publishing connection.</p>
              </div>
              <UBadge
                v-if="!hasFacebookAccess"
                label="Growth+"
                color="warning"
                variant="soft"
              />
              <UBadge
                v-else
                :label="facebookConnection?.connected ? 'Connected' : 'Not connected'"
                :color="facebookConnection?.connected ? 'success' : 'neutral'"
                variant="soft"
              />
            </div>
          </template>

          <div v-if="loadingIntegrations" class="space-y-3">
            <USkeleton class="h-16 rounded-lg" />
            <USkeleton class="h-9 rounded-lg" />
          </div>
          <div v-else-if="!hasFacebookAccess" class="space-y-4">
            <UAlert
              color="warning"
              variant="soft"
              icon="i-lucide-lock"
              title="Growth plan required"
              description="Facebook and Instagram sync is available on the Growth plan and above. Upgrade to connect your Page and auto-sync posts to your site."
            />
            <UButton
              color="primary"
              variant="outline"
              icon="i-lucide-circle-arrow-up"
              :to="`/dashboard/${route.params.orgSlug}/settings/billing`"
            >
              Upgrade to Growth
            </UButton>
          </div>
          <div v-else class="space-y-4">
            <UAlert
              color="info"
              variant="soft"
              icon="i-lucide-lightbulb"
              description="Link your Facebook Page and Instagram Business Account to automatically sync posts to your website. Just post to Facebook or Instagram and we'll handle the rest."
            />

            <div v-if="facebookConnection?.connected" class="space-y-3 text-sm">
              <div class="flex items-center justify-between gap-4">
                <span class="text-muted">Page</span>
                <span class="truncate text-right font-medium text-highlighted">{{ facebookConnection.facebook_page_name || 'Connected page' }}</span>
              </div>
              <div v-if="facebookConnection.facebook_page_id" class="flex items-center justify-between gap-4">
                <span class="text-muted">Page ID</span>
                <span class="truncate text-right text-highlighted">{{ facebookConnection.facebook_page_id }}</span>
              </div>
              <p class="text-muted">Instagram publishing is available when the connected Page has a linked Instagram Business account.</p>
            </div>
            <p v-else class="text-sm text-muted">Connect a Facebook Page to sync page info and publish posts from this site.</p>

            <UButton
              icon="i-simple-icons-facebook"
              :loading="connectingFacebook"
              @click="startFacebookConnect"
            >
              {{ facebookConnection?.connected ? 'Reconnect Facebook' : 'Connect Facebook' }}
            </UButton>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Notifications</h2>
              <p class="mt-1 text-sm text-muted">Where new bookings, messages, and reviews get sent. Always falls back to the owner's account email if nothing below is set.</p>
            </div>
          </template>

          <div v-if="loadingIntegrations" class="space-y-3">
            <USkeleton class="h-10 rounded-lg" />
            <USkeleton class="h-9 rounded-lg" />
          </div>
          <div v-else class="space-y-4">
            <UFormField label="Alert channel" help="Email always works. Add a WhatsApp number below to also (or only) get alerts there.">
              <USelectMenu
                v-model="notificationChannels"
                multiple
                :items="CHANNEL_OPTIONS"
                value-key="value"
                label-key="label"
                class="w-full sm:w-64"
              />
            </UFormField>
            <UFormField
              label="Site-wide WhatsApp number"
              help="Use international format, for example +66812345678. Used for every location unless a location sets its own number below to override it."
            >
              <div class="flex items-center gap-2">
                <UInput v-model="whatsappForm.phone" type="tel" placeholder="+66..." class="flex-1" />
                <UBadge
                  :label="whatsappPhone ? 'Configured' : 'Not configured'"
                  :color="whatsappPhone ? 'success' : 'neutral'"
                  variant="soft"
                />
              </div>
            </UFormField>
            <p class="text-xs text-muted">
              Need a different number for one location only? Set its manager alert number from that location's page instead of here.
            </p>
            <UButton
              icon="i-lucide-check"
              :loading="savingWhatsapp"
              @click="saveWhatsappSettings"
            >
              Save notification settings
            </UButton>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">Default Currency</h2>
                <p class="mt-1 text-sm text-muted">Used for menu prices and experience pricing across all surfaces.</p>
              </div>
              <UBadge
                :label="currencyForm.currency || 'THB'"
                color="neutral"
                variant="soft"
              />
            </div>
          </template>

          <div v-if="loadingCurrency" class="space-y-3">
            <USkeleton class="h-9 rounded-lg" />
          </div>
          <div v-else class="space-y-4">
            <UFormField label="Currency" help="Changing this affects how prices are displayed site-wide.">
              <USelect
                v-model="currencyForm.currency"
                :items="CURRENCY_OPTIONS"
                value-key="value"
                label-key="label"
                class="w-full"
              />
            </UFormField>
            <UButton
              icon="i-lucide-check"
              :loading="savingCurrency"
              @click="saveCurrency"
            >
              Save currency
            </UButton>
          </div>
        </UCard>

        <!-- Danger Zone -->
        <UCard class="lg:col-span-2 border border-red-200 dark:border-red-900">
          <template #header>
            <h2 class="font-semibold text-red-600 dark:text-red-400">Danger Zone</h2>
          </template>

          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="font-medium text-highlighted">Delete Account</p>
              <p class="mt-1 text-sm text-muted">Permanently delete your account, organization, and all associated data. This cannot be undone.</p>
            </div>
            <UButton color="error" variant="outline" @click="deleteModalOpen = true">
              Delete Account
            </UButton>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Delete Account Modal -->
  <UModal v-model:open="deleteModalOpen" :ui="{ content: 'max-w-md' }">
    <template #content>
      <div class="p-6 space-y-4">
        <div>
          <h3 class="text-lg font-semibold text-highlighted">Delete your account?</h3>
          <p class="mt-1 text-sm text-muted">This will permanently delete your account, your organization, all sites, locations, and menu data. This action cannot be undone.</p>
        </div>

        <UAlert
          v-if="deleteError"
          color="error"
          variant="soft"
          icon="i-lucide-triangle-alert"
          :description="deleteError"
        />

        <div class="space-y-2">
          <p id="delete-confirm-instruction" class="text-sm text-muted">
            Type <span class="font-mono font-semibold text-highlighted">DELETE</span> to confirm.
          </p>
          <UInput
            v-model="deleteConfirmText"
            placeholder="DELETE"
            aria-describedby="delete-confirm-instruction"
            :disabled="deleting"
            @keydown.enter="confirmDeleteAccount"
          />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <UButton variant="ghost" color="neutral" :disabled="deleting" @click="resetDeleteModal">
            Cancel
          </UButton>
          <UButton
            color="error"
            :loading="deleting"
            :disabled="deleteConfirmText !== 'DELETE'"
            @click="confirmDeleteAccount"
          >
            Delete Account
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { CurrencyCode } from '~/shared/currencies'
import { authClient } from '~/lib/auth-client'
import { useAuth } from '~/composables/useAuth'
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY, isCurrencyCode } from '~/shared/currencies'

const { data: sessionData } = useAuth()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const dashboard = useDashboardSite()
const hasFacebookAccess = computed(() => {
  const plan = dashboard.site.value?.plan
  return plan === 'growth' || plan === 'managed' || plan === 'seo_accelerator'
})
// authClient.useListOrganizations()[0] picked whichever org the user's list
// happened to return first — wrong whenever this org-scoped settings page
// (/dashboard/[orgSlug]/settings/general) isn't that org. dashboard.organization
// is already resolved from the route's orgSlug (see useDashboardSite.ts) and
// carries role directly, with no metadata indirection needed.
const organization = dashboard.organization
const organizationRole = computed(() => organization.value?.role || 'Member')

const loadingCurrency = ref(true)
const savingCurrency = ref(false)
const currencyForm = reactive({ currency: DEFAULT_CURRENCY as CurrencyCode })

const deleteModalOpen = ref(false)
const deleteConfirmText = ref('')
const deleting = ref(false)
const deleteError = ref('')
const loadingIntegrations = ref(true)
const connectingFacebook = ref(false)
const savingWhatsapp = ref(false)
const whatsappPhone = ref<string | null>(null)
const whatsappForm = reactive({ phone: '' })
const notificationChannels = ref<string[]>(['email'])
const CHANNEL_OPTIONS = [
  { label: 'Email', value: 'email' },
  { label: 'WhatsApp', value: 'whatsapp' },
]
const facebookConnection = ref<FacebookConnectionStatus | null>(null)

interface FacebookConnectionStatus {
  connected: boolean
  facebook_user_id?: string
  facebook_page_id?: string
  facebook_page_name?: string
  status?: string
}

interface DeleteErrorBody {
  error?: string
  message?: string
}

function getDeleteErrorBody(error: unknown): DeleteErrorBody {
  if (!error || typeof error !== 'object') return {}
  const record = error as Record<string, unknown>

  const data = record.data
  if (data && typeof data === 'object') return data as DeleteErrorBody

  const response = record.response
  if (response && typeof response === 'object') {
    const responseData = (response as Record<string, unknown>)._data
    if (responseData && typeof responseData === 'object') {
      return responseData as DeleteErrorBody
    }
  }

  return {}
}

function resetDeleteModal() {
  deleteModalOpen.value = false
}

watch(deleteModalOpen, (open) => {
  if (open) return
  deleteConfirmText.value = ''
  deleteError.value = ''
  deleting.value = false
})

async function loadCurrency() {
  loadingCurrency.value = true
  try {
    const res = await $fetch<{ success: boolean; settings: { default_currency?: string } }>('/api/dashboard/settings')
    const fetched = res.settings?.default_currency
    currencyForm.currency = isCurrencyCode(fetched) ? fetched : DEFAULT_CURRENCY
  } catch {
    currencyForm.currency = DEFAULT_CURRENCY
  } finally {
    loadingCurrency.value = false
  }
}

async function saveCurrency() {
  savingCurrency.value = true
  try {
    await $fetch('/api/dashboard/settings', {
      method: 'PATCH',
      body: { default_currency: currencyForm.currency },
    })
    toast.add({ description: 'Currency saved', color: 'success' })
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to save currency'), color: 'error' })
  } finally {
    savingCurrency.value = false
  }
}

async function loadSiteIntegrations() {
  loadingIntegrations.value = true
  try {
    if (!dashboard.state.value) await dashboard.refresh()
    if (!dashboard.site.value) {
      whatsappPhone.value = null
      whatsappForm.phone = ''
      notificationChannels.value = ['email']
      facebookConnection.value = { connected: false }
      return
    }

    const plan = dashboard.site.value.plan
    const canUseFacebook = plan === 'growth' || plan === 'managed' || plan === 'seo_accelerator'

    const [notificationsRes, facebookRes] = await Promise.all([
      $fetch<{ success: boolean; notifications: { whatsapp_phone: string | null; channels: string[] } }>('/api/dashboard/editor/notifications'),
      canUseFacebook
        ? $fetch<FacebookConnectionStatus>('/api/integrations/facebook-pages/connection')
        : Promise.resolve<FacebookConnectionStatus>({ connected: false }),
    ])
    whatsappPhone.value = notificationsRes.notifications.whatsapp_phone
    whatsappForm.phone = notificationsRes.notifications.whatsapp_phone ?? ''
    notificationChannels.value = notificationsRes.notifications.channels?.length ? notificationsRes.notifications.channels : ['email']
    facebookConnection.value = facebookRes
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to load site connections'), color: 'error' })
  } finally {
    loadingIntegrations.value = false
  }
}

async function startFacebookConnect() {
  connectingFacebook.value = true
  try {
    const res = await $fetch<{ success: boolean; authUrl?: string; error?: string }>(
      '/api/integrations/facebook-pages/auth',
      { method: 'POST' }
    )
    if (!res.authUrl) throw new Error(res.error || 'No authorization URL returned')
    window.location.href = res.authUrl
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to start Facebook connection'), color: 'error' })
    connectingFacebook.value = false
  }
}

async function saveWhatsappSettings() {
  if (notificationChannels.value.length === 0) {
    toast.add({ description: 'Select at least one notification channel', color: 'error' })
    return
  }
  if (notificationChannels.value.includes('whatsapp') && !whatsappForm.phone.trim()) {
    toast.add({ description: 'Add a WhatsApp number to use the WhatsApp channel', color: 'error' })
    return
  }
  savingWhatsapp.value = true
  try {
    const res = await $fetch<{ success: boolean; notifications: { whatsapp_phone: string | null; channels: string[] } }>('/api/dashboard/editor/notifications', {
      method: 'PATCH',
      body: { whatsapp_phone: whatsappForm.phone.trim() || null, channels: notificationChannels.value }
    })
    whatsappPhone.value = res.notifications.whatsapp_phone
    whatsappForm.phone = res.notifications.whatsapp_phone ?? ''
    notificationChannels.value = res.notifications.channels
    toast.add({ description: 'Notification settings saved', color: 'success' })
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to save notification settings'), color: 'error' })
  } finally {
    savingWhatsapp.value = false
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const data = (error as Record<string, unknown>).data
    if (data && typeof data === 'object') {
      const errorMessage = (data as Record<string, unknown>).error
      if (typeof errorMessage === 'string' && errorMessage) return errorMessage
    }
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

async function confirmDeleteAccount() {
  if (deleteConfirmText.value !== 'DELETE') return

  deleting.value = true
  deleteError.value = ''

  try {
    const res = await $fetch<{ success?: boolean }>('/api/user/delete-account', { method: 'POST' })

    if (res?.success) {
      try {
        await authClient.signOut()
      } catch (signOutErr) {
        const error = signOutErr instanceof Error ? signOutErr : new Error(String(signOutErr))
        console.error('Sign out failed after account deletion:', error.message)
      }
      deleteError.value = ''
      deleting.value = false
      deleteModalOpen.value = false
      try {
        await navigateTo('/')
      } catch (navErr) {
        const error = navErr instanceof Error ? navErr : new Error(String(navErr))
        console.error('Navigation failed after account deletion:', error.message)
        window.location.href = '/'
      }
    } else {
      deleteError.value = 'Account deletion failed. Please try again.'
      deleting.value = false
    }
  } catch (err) {
    const body = getDeleteErrorBody(err instanceof Error ? err : new Error(String(err)))
    if (body?.error === 'active_subscription') {
      deleteError.value = 'You have an active subscription. Please cancel it from the Billing page before deleting your account.'
    } else {
      deleteError.value = body?.message ?? 'Something went wrong. Please try again.'
    }
    deleting.value = false
  }
}

onMounted(() => {
  loadCurrency()
  loadSiteIntegrations()
  const fbStatus = typeof route.query.fb === 'string' ? route.query.fb : null
  if (fbStatus === 'connected') {
    toast.add({ title: 'Facebook connected', description: 'Your Facebook Page has been linked successfully.', color: 'success' })
  } else if (fbStatus === 'error') {
    toast.add({ title: 'Facebook connection failed', description: 'Something went wrong. Please try again.', color: 'error' })
  } else if (fbStatus === 'denied') {
    toast.add({ title: 'Facebook access denied', description: 'You declined the Facebook authorization.', color: 'warning' })
  } else if (fbStatus === 'no_pages') {
    toast.add({ title: 'No Facebook Pages found', description: 'Your account has no Pages. Create a Facebook Page for your business and try again.', color: 'warning' })
  }
  if (fbStatus) {
    const { fb: _fb, ...restQuery } = route.query
    router.replace({ query: restQuery })
  }
})

useSeoMeta({ title: 'Settings | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
