<template>
  <UDashboardPanel id="account-profile">
    <template #header>
      <UDashboardNavbar title="Profile">
        <template #leading>
          <DashboardNavbarLeading :detail-to="accountIndexTo" detail-label="Account" icon-only />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-4xl divide-y divide-default border-y border-default">
        <section class="profile-row" :class="rowTone('avatar')">
          <div><h3 class="font-medium text-highlighted">Avatar</h3><p class="text-sm text-muted">Managed by your sign-in provider</p></div>
          <UAvatar :src="sessionData?.user?.image ?? undefined" :text="getInitials(sessionData?.user?.name || sessionData?.user?.email)" alt="User avatar" size="lg" />
        </section>

        <section class="profile-row items-start" :class="rowTone('name')">
          <div class="min-w-0 flex-1 space-y-3">
            <div><h3 class="font-medium text-highlighted">Display Name</h3><p v-if="editingRow !== 'name'" class="truncate text-sm text-muted">{{ sessionData?.user?.name || 'Not set' }}</p></div>
            <UInput v-if="editingRow === 'name'" v-model="nameInput" class="max-w-md" autofocus @input="nameTouched = true" @keydown.enter="saveName" />
            <div v-if="editingRow === 'name'" class="flex gap-2"><UButton size="sm" :disabled="!nameDirty" :loading="nameSaving" @click="saveNameAndClose">Save</UButton><UButton size="sm" color="neutral" variant="ghost" @click="cancelEdit">Cancel</UButton></div>
          </div>
          <UButton v-if="editingRow !== 'name'" size="sm" color="neutral" variant="ghost" @click="editingRow = 'name'">Edit</UButton>
        </section>

        <section class="profile-row" :class="rowTone('email')">
          <div class="min-w-0"><h3 class="font-medium text-highlighted">Email</h3><p class="truncate text-sm text-muted">{{ sessionData?.user?.email }}</p></div>
          <UBadge v-if="sessionData?.user?.emailVerified" color="success" variant="subtle" size="sm">Verified</UBadge>
        </section>

        <section class="profile-row items-start" :class="rowTone('phone')">
          <div class="min-w-0 flex-1 space-y-3">
            <div><h3 class="font-medium text-highlighted">Phone Number</h3><p v-if="editingRow !== 'phone'" class="truncate text-sm text-muted">{{ sessionData?.user?.phoneNumber || 'Not set' }}</p></div>
            <UInput v-if="editingRow === 'phone'" v-model="phoneInput" class="max-w-md" placeholder="+1234567890" autofocus @input="phoneTouched = true" @keydown.enter="requestPhoneVerify" />
            <div v-if="editingRow === 'phone'" class="flex gap-2"><UButton size="sm" :disabled="!phoneDirty || !phoneInput.trim()" :loading="phoneSaving" @click="requestPhoneVerify">Verify & Save</UButton><UButton size="sm" color="neutral" variant="ghost" @click="cancelEdit">Cancel</UButton></div>
          </div>
          <UButton v-if="editingRow !== 'phone'" size="sm" color="neutral" variant="ghost" @click="editingRow = 'phone'">Edit</UButton>
        </section>

        <section class="profile-row" :class="rowTone('user-id')">
          <div class="min-w-0"><h3 class="font-medium text-highlighted">User ID</h3><p class="truncate font-mono text-sm text-muted">{{ sessionData?.user?.id }}</p></div>
          <UButton color="neutral" variant="ghost" icon="i-lucide-clipboard" aria-label="Copy user ID" @click="copyUserId" />
        </section>

        <section class="profile-row" :class="rowTone('delete')">
          <div><h3 class="font-medium text-error">Delete Account</h3><p class="text-sm text-muted">Permanently remove your personal account</p></div>
          <UButton color="error" variant="ghost" size="sm" @click="deleteModalOpen = true">Delete</UButton>
        </section>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Delete Account Modal -->
  <UModal v-model:open="deleteModalOpen" :dismissible="!deleting" :ui="{ content: 'max-w-md' }">
    <template #content>
      <div class="p-6 space-y-4">
        <div>
          <h3 class="text-lg font-semibold text-highlighted">Delete your account?</h3>
          <p class="mt-1 text-sm text-muted">This will permanently delete your account, organization, site, locations, and menu data. This action cannot be undone.</p>
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

  <!-- OTP Verification Modal -->
  <UModal v-model:open="verifyModalOpen" :ui="{ content: 'max-w-sm' }">
    <template #content>
      <div class="p-6 space-y-4">
        <div>
          <h3 class="text-lg font-semibold text-highlighted">Verify Phone Number</h3>
          <p class="mt-1 text-sm text-muted">Enter the 6-digit code sent to {{ phoneInput }} via WhatsApp.</p>
        </div>
        
        <UAlert v-if="verifyError" color="error" variant="soft" :description="verifyError" />

        <UInput
          v-model="otpCode"
          placeholder="000000"
          class="font-mono text-center text-lg tracking-widest"
          maxlength="6"
          :disabled="otpVerifying"
          @keydown.enter="verifyPhone"
        />

        <div class="flex justify-end gap-2 pt-2">
          <UButton variant="ghost" color="neutral" :disabled="otpVerifying" @click="verifyModalOpen = false">
            Cancel
          </UButton>
          <UButton
            color="primary"
            :loading="otpVerifying"
            :disabled="otpCode.length !== 6"
            @click="verifyPhone"
          >
            Verify
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
// -nocheck
import { authClient } from '~/lib/auth-client'
import { useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'dashboard' })

const toast = useToast()
const route = useRoute()
const accountIndexTo = computed(() => ({
  path: '/dashboard/account',
  query: {
    ...(typeof route.query.organization === 'string' ? { organization: route.query.organization } : {}),
    ...(typeof route.query.organizationName === 'string' ? { organizationName: route.query.organizationName } : {}),
  },
}))
const { data: sessionData } = useAuth()
const refreshSession = async () => {
  await authClient.getSession()
}
// Display Name
const nameInput = ref(sessionData.value?.user?.name || '')
const nameDirty = computed(() => nameInput.value.trim() !== (sessionData.value?.user?.name || ''))
const nameSaving = ref(false)
type ProfileRow = 'avatar' | 'name' | 'email' | 'phone' | 'user-id' | 'delete'
const editingRow = ref<ProfileRow | null>(null)

function rowTone(row: ProfileRow) {
  return editingRow.value && editingRow.value !== row ? 'opacity-40' : ''
}

function cancelEdit() {
  nameInput.value = sessionData.value?.user?.name || ''
  phoneInput.value = sessionData.value?.user?.phoneNumber || ''
  nameTouched.value = false
  phoneTouched.value = false
  editingRow.value = null
}

async function saveName() {
  if (!nameDirty.value) return false
  nameSaving.value = true
  try {
    await authClient.updateUser({ name: nameInput.value.trim() })
    await refreshSession()
    toast.add({ title: 'Name updated', icon: 'i-lucide-circle-check', color: 'success' })
    return true
  } catch (_err) {
    const msg = _err instanceof Error ? _err.message : String(_err)
    toast.add({ title: 'Update failed', description: msg, color: 'error' })
    return false
  } finally {
    nameSaving.value = false
  }
}

async function saveNameAndClose() {
  if (await saveName()) editingRow.value = null
}

// useAuth()'s session resolves asynchronously, so nameInput starts as '' before
// the real name arrives. Gating the sync on nameDirty breaks the moment that
// happens: dirty is computed against sessionData too, so populating the name
// alone (no user input at all) flips '' !== 'RealName' to dirty and the sync
// never runs — the field is stuck blank. nameTouched tracks only genuine user
// edits (set from @input, a native DOM event a programmatic ref assignment
// never dispatches), independent of what the comparison side is doing.
const nameTouched = ref(false)
watch(() => sessionData.value?.user?.name, (newVal) => {
  if (newVal !== undefined && !nameTouched.value) nameInput.value = newVal || ''
}, { immediate: true })

// Phone Number
const phoneInput = ref(sessionData.value?.user?.phoneNumber || '')
const phoneDirty = computed(() => phoneInput.value.trim() !== (sessionData.value?.user?.phoneNumber || ''))
const phoneSaving = ref(false)
const verifyModalOpen = ref(false)
const otpCode = ref('')
const otpVerifying = ref(false)
const verifyError = ref('')

async function requestPhoneVerify() {
  if (phoneSaving.value || !phoneDirty.value || !phoneInput.value.trim()) return
  phoneSaving.value = true
  try {
    const res = await authClient.phoneNumber.sendOtp({ phoneNumber: phoneInput.value.trim() })
    if (res.error) throw new Error(res.error.message || 'Failed to send OTP')
    
    otpCode.value = ''
    verifyError.value = ''
    verifyModalOpen.value = true
  } catch (_err) {
    const msg = _err instanceof Error ? _err.message : String(_err)
    toast.add({ title: 'Verification failed', description: msg, color: 'error' })
  } finally {
    phoneSaving.value = false
  }
}

async function verifyPhone() {
  if (otpCode.value.length !== 6) return
  otpVerifying.value = true
  verifyError.value = ''
  try {
    const res = await authClient.phoneNumber.verify({ 
      phoneNumber: phoneInput.value.trim(), 
      code: otpCode.value.trim() 
    })
    if (res.error) throw new Error(res.error.message || 'Invalid code')
    
    await refreshSession()
    verifyModalOpen.value = false
    editingRow.value = null
    toast.add({ title: 'Phone verified', icon: 'i-lucide-circle-check', color: 'success' })
  } catch (_err) {
    verifyError.value = _err instanceof Error ? _err.message : String(_err)
  } finally {
    otpVerifying.value = false
  }
}

const phoneTouched = ref(false)
watch(() => sessionData.value?.user?.phoneNumber, (newVal) => {
  if (newVal !== undefined && !phoneTouched.value) phoneInput.value = newVal || ''
}, { immediate: true })

// User ID
async function copyUserId() {
  if (!sessionData.value?.user?.id) return
  try {
    await navigator.clipboard.writeText(sessionData.value.user.id)
    toast.add({ title: 'User ID copied', icon: 'i-lucide-circle-check', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to copy', color: 'error' })
  }
}

// Danger Zone
const deleteModalOpen = ref(false)
const deleteConfirmText = ref('')
const deleting = ref(false)
const deleteError = ref('')

interface DeleteErrorBody {
  error?: string
  message?: string
}

function getDeleteErrorBody(error: unknown): DeleteErrorBody {
  if (error instanceof ApiClientError) {
    return {
      error: typeof error.data.error === 'string' ? error.data.error : undefined,
      message: error.message,
    }
  }
  if (!error || typeof error !== 'object') return {}
  const record = error as Record<string, unknown>
  const data = record.data
  if (data && typeof data === 'object') return data as DeleteErrorBody
  const response = record.response
  if (response && typeof response === 'object') {
    const responseData = (response as Record<string, unknown>)._data
    if (responseData && typeof responseData === 'object') return responseData as DeleteErrorBody
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
})

async function confirmDeleteAccount() {
  if (deleteConfirmText.value !== 'DELETE') return
  deleting.value = true
  deleteError.value = ''

  try {
    const res = await applicationFetch<{ success?: boolean }>('/api/user/delete-account', {
      method: 'POST',
      validate: (value): value is { success?: boolean } =>
        isRecord(value) && (value.success === undefined || typeof value.success === 'boolean'),
    })
    if (res?.success) {
      try { await authClient.signOut() } catch (_err) { /* ignore */ }
      try {
        await navigateTo('/')
        resetDeleteModal()
      } catch (_err) {
        deleteError.value = 'Account deleted successfully! Automatic redirect failed. Please refresh the page or click Cancel to return home.'
      }
    } else {
      deleteError.value = 'Account deletion failed. Please try again.'
    }
  } catch (_err) {
    const body = getDeleteErrorBody(_err instanceof Error ? _err : new Error(String(_err)))
    if (body?.error === 'active_subscription') {
      deleteError.value = 'You have an active subscription. Please cancel it from the Billing page before deleting your account.'
    } else {
      deleteError.value = body?.message ?? 'Something went wrong. Please try again.'
    }
  } finally {
    deleting.value = false
  }
}

useSeoMeta({ title: 'Profile | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>

<style scoped>
.profile-row {
  display: flex;
  min-height: var(--ws-row-min-height, 66px);
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-block: 1rem;
  transition: opacity 150ms ease;
}
</style>
