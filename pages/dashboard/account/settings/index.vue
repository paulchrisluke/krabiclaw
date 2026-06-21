<template>
  <UPage>

    <UPageBody>
      <div class="max-w-4xl space-y-6">
        
        <!-- Avatar -->
        <UCard :ui="{ body: 'p-6' }">
          <div class="flex items-center justify-between gap-6">
            <div class="space-y-1 flex-1">
              <h3 class="text-base font-medium text-highlighted">Avatar</h3>
              <p class="text-sm text-muted">
                This is your avatar.<br>
                Click on the avatar to upload a custom one from your files.
              </p>
            </div>
            <div 
              class="relative group cursor-pointer shrink-0" 
              @click="openUploadPicker"
              :class="{ 'opacity-50 pointer-events-none': uploadLoading }"
            >
              <AppAvatar
                :src="sessionData?.user?.image ?? undefined"
                :name="sessionData?.user?.name || sessionData?.user?.email"
                alt="User avatar"
                size="3xl"
                class="ring-1 ring-border group-hover:ring-primary transition-all"
              />
              <div class="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity text-white">
                <UIcon name="i-heroicons-camera" class="size-6" v-if="!uploadLoading" />
                <UIcon name="i-heroicons-arrow-path" class="size-6 animate-spin" v-else />
              </div>
              <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileSelect" />
            </div>
          </div>
          <template #footer>
            <div class="flex items-center justify-between text-sm text-muted">
              <span>An avatar is optional but strongly recommended.</span>
            </div>
          </template>
        </UCard>

        <!-- Display Name -->
        <UCard :ui="{ body: 'p-6' }">
          <div class="space-y-4">
            <div class="space-y-1">
              <h3 class="text-base font-medium text-highlighted">Display Name</h3>
              <p class="text-sm text-muted">Please enter your full name, or a display name you are comfortable with.</p>
            </div>
            <UInput 
              v-model="nameInput" 
              class="max-w-md"
              @keydown.enter="saveName"
            />
          </div>
          <template #footer>
            <div class="flex items-center justify-between text-sm text-muted">
              <span>Please use 32 characters at maximum.</span>
              <UButton 
                size="sm" 
                color="neutral" 
                variant="solid" 
                :disabled="!nameDirty"
                :loading="nameSaving"
                @click="saveName"
              >
                Save
              </UButton>
            </div>
          </template>
        </UCard>

        <!-- Organization / Default Team -->
        <UCard :ui="{ body: 'p-6' }" v-if="organization">
          <div class="space-y-4">
            <div class="space-y-1">
              <h3 class="text-base font-medium text-highlighted">Organization Name</h3>
              <p class="text-sm text-muted">This is your primary workspace name.</p>
            </div>
            <div class="flex items-center gap-2 max-w-md">
              <UInput 
                v-model="orgNameInput" 
                class="flex-1"
                @keydown.enter="saveOrgName"
              />
            </div>
          </div>
          <template #footer>
            <div class="flex items-center justify-between text-sm text-muted">
              <span>Used as the default team workspace.</span>
              <UButton 
                size="sm" 
                color="neutral" 
                variant="solid" 
                :disabled="!orgNameDirty"
                :loading="orgNameSaving"
                @click="saveOrgName"
              >
                Save
              </UButton>
            </div>
          </template>
        </UCard>

        <!-- Email -->
        <UCard :ui="{ body: 'p-6' }">
          <div class="space-y-4">
            <div class="space-y-1">
              <h3 class="text-base font-medium text-highlighted">Email</h3>
              <p class="text-sm text-muted">Your primary email will be used for account-related notifications.</p>
            </div>
            <div class="flex items-center gap-3">
              <span class="font-medium text-highlighted">{{ sessionData?.user?.email }}</span>
              <UBadge color="primary" variant="subtle" size="sm">Primary</UBadge>
              <UBadge v-if="sessionData?.user?.emailVerified" color="success" variant="subtle" size="sm">Verified</UBadge>
            </div>
          </div>
          <template #footer>
            <div class="flex items-center justify-between text-sm text-muted">
              <span>Email is managed via your social login provider.</span>
            </div>
          </template>
        </UCard>

        <!-- Phone Number -->
        <UCard :ui="{ body: 'p-6' }">
          <div class="space-y-4">
            <div class="space-y-1">
              <h3 class="text-base font-medium text-highlighted">Your Phone Number</h3>
              <p class="text-sm text-muted">Enter a phone number to receive important service updates by WhatsApp.</p>
            </div>
            <UInput 
              v-model="phoneInput" 
              class="max-w-md"
              placeholder="+1234567890"
              @keydown.enter="requestPhoneVerify"
            />
            <div v-if="sessionData?.user?.phoneNumberVerified && phoneInput === sessionData?.user?.phoneNumber" class="flex items-center gap-2 mt-2">
              <UIcon name="i-heroicons-check-circle" class="text-success size-5" />
              <span class="text-sm text-success">Verified</span>
            </div>
          </div>
          <template #footer>
            <div class="flex items-center justify-between text-sm text-muted">
              <span>A verification code will be sent via WhatsApp.</span>
              <UButton 
                size="sm" 
                color="neutral" 
                variant="solid" 
                :disabled="!phoneDirty || !phoneInput.trim()"
                :loading="phoneSaving"
                @click="requestPhoneVerify"
              >
                Verify & Save
              </UButton>
            </div>
          </template>
        </UCard>

        <!-- User ID -->
        <UCard :ui="{ body: 'p-6' }">
          <div class="space-y-4">
            <div class="space-y-1">
              <h3 class="text-base font-medium text-highlighted">User ID</h3>
              <p class="text-sm text-muted">This is your unique user ID within the platform.</p>
            </div>
            <div class="flex items-center gap-2 max-w-md">
              <UInput 
                :model-value="sessionData?.user?.id" 
                readonly
                class="font-mono text-sm flex-1"
                :ui="{ root: 'bg-muted/50 cursor-text' }"
              />
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-clipboard"
                @click="copyUserId"
              />
            </div>
          </div>
          <template #footer>
            <div class="flex items-center justify-between text-sm text-muted">
              <span>Used when interacting with support or API.</span>
            </div>
          </template>
        </UCard>

        <!-- Danger Zone -->
        <UCard :ui="{ root: 'border border-red-500 dark:border-red-800 transition-colors', body: 'p-6', footer: 'p-4 bg-red-50/50 dark:bg-red-950/20 border-t border-red-200 dark:border-red-900/50' }">
          <div class="space-y-1">
            <h3 class="text-base font-semibold text-highlighted">Delete Account</h3>
            <p class="text-sm text-muted">Permanently remove your Personal Account and all of its contents from the platform. This action is not reversible, so please continue with caution.</p>
          </div>
          <template #footer>
            <div class="flex items-center justify-end">
              <UButton color="error" variant="solid" @click="deleteModalOpen = true">
                Delete Personal Account
              </UButton>
            </div>
          </template>
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
          <p class="mt-1 text-sm text-muted">This will permanently delete your account, organization, site, locations, and menu data. This action cannot be undone.</p>
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
const { data: sessionData } = useAuth()
const refreshSession = async () => {
  await authClient.getSession()
}
const organizationsState = authClient.useListOrganizations()
const organization = computed(() => unref(organizationsState)?.data?.[0] || null)

// Avatar Upload
const fileInput = ref<HTMLInputElement | null>(null)
const uploadLoading = ref(false)
const siteApiBase = `/api/dashboard/editor`

function openUploadPicker() {
  fileInput.value?.click()
}

async function onFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  
  uploadLoading.value = true
  try {
    const { assetId, uploadUrl } = await $fetch<{ assetId: string; uploadUrl: string }>(
      `${siteApiBase}/media/request-upload`,
      { method: 'POST', body: { filename: file.name, category: 'team' } }
    )
    
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(uploadUrl, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)

    const { asset } = await $fetch<{ asset: { public_url: string } }>(`${siteApiBase}/media/${assetId}/confirm`, { method: 'POST' })
    
    await authClient.updateUser({ image: asset.public_url })
    await refreshSession()
    toast.add({ title: 'Avatar updated', icon: 'i-heroicons-check-circle', color: 'success' })
  } catch (_err) {
    const msg = _err instanceof Error ? _err.message : String(_err)
    toast.add({ title: 'Upload failed', description: msg, color: 'error', icon: 'i-heroicons-exclamation-triangle' })
  } finally {
    uploadLoading.value = false
    target.value = ''
  }
}

// Display Name
const nameInput = ref(sessionData.value?.user?.name || '')
const nameDirty = computed(() => nameInput.value.trim() !== (sessionData.value?.user?.name || ''))
const nameSaving = ref(false)

async function saveName() {
  if (!nameDirty.value) return
  nameSaving.value = true
  try {
    await authClient.updateUser({ name: nameInput.value.trim() })
    await refreshSession()
    toast.add({ title: 'Name updated', icon: 'i-heroicons-check-circle', color: 'success' })
  } catch (_err) {
    const msg = _err instanceof Error ? _err.message : String(_err)
    toast.add({ title: 'Update failed', description: msg, color: 'error' })
  } finally {
    nameSaving.value = false
  }
}

watch(() => sessionData.value?.user?.name, (newVal) => {
  if (newVal && !nameDirty.value) nameInput.value = newVal
})

// Organization Name
const orgNameInput = ref(organization.value?.name || '')
const orgNameDirty = computed(() => orgNameInput.value.trim() !== (organization.value?.name || ''))
const orgNameSaving = ref(false)

async function saveOrgName() {
  if (!orgNameDirty.value || !organization.value) return
  orgNameSaving.value = true
  try {
    await authClient.organization.update({ 
      organizationId: organization.value.id, 
      data: { name: orgNameInput.value.trim() } 
    })
    toast.add({ title: 'Organization updated', icon: 'i-heroicons-check-circle', color: 'success' })
  } catch (_err) {
    const msg = _err instanceof Error ? _err.message : String(_err)
    toast.add({ title: 'Update failed', description: msg, color: 'error' })
  } finally {
    orgNameSaving.value = false
  }
}

watch(() => organization.value?.name, (newVal) => {
  if (newVal && !orgNameDirty.value) orgNameInput.value = newVal
})

// Phone Number
const phoneInput = ref(sessionData.value?.user?.phoneNumber || '')
const phoneDirty = computed(() => phoneInput.value.trim() !== (sessionData.value?.user?.phoneNumber || ''))
const phoneSaving = ref(false)
const verifyModalOpen = ref(false)
const otpCode = ref('')
const otpVerifying = ref(false)
const verifyError = ref('')

async function requestPhoneVerify() {
  if (!phoneDirty.value || !phoneInput.value.trim()) return
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
    toast.add({ title: 'Phone verified', icon: 'i-heroicons-check-circle', color: 'success' })
  } catch (_err) {
    verifyError.value = _err instanceof Error ? _err.message : String(_err)
  } finally {
    otpVerifying.value = false
  }
}

watch(() => sessionData.value?.user?.phoneNumber, (newVal) => {
  if (newVal && !phoneDirty.value) phoneInput.value = newVal
})

// User ID
function copyUserId() {
  if (!sessionData.value?.user?.id) return
  navigator.clipboard.writeText(sessionData.value.user.id)
  toast.add({ title: 'User ID copied', icon: 'i-heroicons-check-circle', color: 'success' })
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

useSeoMeta({ title: 'Settings | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
