<template>
  <UPage>
    <UPageBody>
      <div class="mb-6 space-y-1">
        <h1 class="text-2xl font-semibold text-highlighted">Settings</h1>
        <p class="text-sm text-muted">Organization and account preferences for the dashboard.</p>
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">Profile</h2>
          </template>

          <div class="flex items-center gap-4">
            <AppAvatar
              :src="sessionData?.user?.image ?? undefined"
              :name="sessionData?.user?.name || sessionData?.user?.email"
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
                <p class="mt-1 text-sm text-muted">Restaurant-site publishing connection.</p>
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
              icon="i-heroicons-lock-closed"
              title="Growth plan required"
              description="Facebook and Instagram sync is available on the Growth plan and above. Upgrade to connect your Page and auto-sync posts to your site."
            />
            <UButton
              color="primary"
              variant="outline"
              icon="i-heroicons-arrow-up-circle"
              :to="`/dashboard/${route.params.orgSlug}/~/billing`"
            >
              Upgrade to Growth
            </UButton>
          </div>
          <div v-else class="space-y-4">
            <UAlert
              color="info"
              variant="soft"
              icon="i-heroicons-light-bulb"
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
            <p v-else class="text-sm text-muted">Connect a Facebook Page to sync page info and publish posts from this restaurant site.</p>

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
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">WhatsApp Notifications</h2>
                <p class="mt-1 text-sm text-muted">Restaurant-site alert recipient.</p>
              </div>
              <UBadge
                :label="whatsappPhone ? 'Configured' : 'Not configured'"
                :color="whatsappPhone ? 'success' : 'neutral'"
                variant="soft"
              />
            </div>
          </template>

          <div v-if="loadingIntegrations" class="space-y-3">
            <USkeleton class="h-10 rounded-lg" />
            <USkeleton class="h-9 rounded-lg" />
          </div>
          <div v-else class="space-y-4">
            <UFormField label="Notification phone" help="Use international format, for example +66812345678.">
              <UInput v-model="whatsappForm.phone" type="tel" placeholder="+66..." />
            </UFormField>
            <UButton
              icon="i-heroicons-check"
              :loading="savingWhatsapp"
              :disabled="!whatsappForm.phone.trim()"
              @click="saveWhatsappPhone"
            >
              Save WhatsApp number
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
    </UPageBody>
  </UPage>

  <!-- Delete Account Modal -->
  <UModal v-model:open="deleteModalOpen" :ui="{ content: 'max-w-md' }" @close="resetDeleteModal">
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
          icon="i-heroicons-exclamation-triangle"
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
import { authClient } from '~/lib/auth-client'
import { useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'dashboard' })

const { data: sessionData } = useAuth()
const route = useRoute()
const toast = useToast()
const dashboard = useDashboardRestaurant()
const hasFacebookAccess = computed(() => {
  const plan = dashboard.restaurant.value?.plan
  return plan === 'growth' || plan === 'managed' || plan === 'seo_accelerator'
})
const organizationsState = authClient.useListOrganizations()
const organization = computed(() => unref(organizationsState)?.data?.[0] || null)
const organizationRole = computed(() => {
  const metadata = organization.value?.metadata
  if (metadata && typeof metadata === 'object' && 'role' in metadata && typeof metadata.role === 'string' && metadata.role.trim()) {
    return metadata.role.trim()
  }
  return 'Member'
})

const deleteModalOpen = ref(false)
const deleteConfirmText = ref('')
const deleting = ref(false)
const deleteError = ref('')
const loadingIntegrations = ref(true)
const connectingFacebook = ref(false)
const savingWhatsapp = ref(false)
const whatsappPhone = ref<string | null>(null)
const whatsappForm = reactive({ phone: '' })
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
  deleteConfirmText.value = ''
  deleteError.value = ''
  deleting.value = false
}

async function loadSiteIntegrations() {
  loadingIntegrations.value = true
  try {
    if (!dashboard.state.value) await dashboard.refresh()
    if (!dashboard.restaurant.value) {
      whatsappPhone.value = null
      whatsappForm.phone = ''
      facebookConnection.value = { connected: false }
      return
    }

    const plan = dashboard.restaurant.value.plan
    const canUseFacebook = plan === 'growth' || plan === 'managed' || plan === 'seo_accelerator'

    const [notificationsRes, facebookRes] = await Promise.all([
      $fetch<{ success: boolean; notifications: { whatsapp_phone: string | null } }>('/api/dashboard/editor/notifications'),
      canUseFacebook
        ? $fetch<FacebookConnectionStatus>('/api/integrations/facebook-pages/connection')
        : Promise.resolve<FacebookConnectionStatus>({ connected: false }),
    ])
    whatsappPhone.value = notificationsRes.notifications.whatsapp_phone
    whatsappForm.phone = notificationsRes.notifications.whatsapp_phone ?? ''
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

async function saveWhatsappPhone() {
  savingWhatsapp.value = true
  try {
    const res = await $fetch<{ success: boolean; notifications: { whatsapp_phone: string } }>('/api/dashboard/editor/notifications', {
      method: 'PATCH',
      body: { whatsapp_phone: whatsappForm.phone }
    })
    whatsappPhone.value = res.notifications.whatsapp_phone
    whatsappForm.phone = res.notifications.whatsapp_phone
    toast.add({ description: 'WhatsApp number saved', color: 'success' })
  } catch (err) {
    toast.add({ description: getErrorMessage(err, 'Failed to save WhatsApp number'), color: 'error' })
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
})

useSeoMeta({ title: 'Settings | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
