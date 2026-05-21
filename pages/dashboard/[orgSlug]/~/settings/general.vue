<template>
  <UPage>
    <UPageHeader
      title="Settings"
      description="Organization and account preferences for the dashboard."
    />

    <UPageBody>
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

useSeoMeta({ title: 'Settings | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
