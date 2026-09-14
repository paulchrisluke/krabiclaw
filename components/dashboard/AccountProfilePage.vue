<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <UDashboardPanel v-else id="account-profile" :ui="{ body: 'min-h-0 gap-0! overflow-hidden! p-0! sm:p-0!' }">
    <template #header>
      <UDashboardNavbar title="Account" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading to="/dashboard" label="Dashboard" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <EditorPaneShell
        :has-detail="frame.mode.value === 'pair'"
        show-desktop-detail
        :detail-title="detailTitle"
        :dismiss-to="profilePath"
        show-actions
        :saving="saving"
        :save-disabled="saveDisabled"
        :save-label="saveLabel"
        @cancel="closeDetail"
        @save="saveDetail"
      >
        <template #index>
          <!--
            One carded list of rows, the same surface every other settings hub
            draws — this level used to hand-roll `.profile-row`, which is why it
            was the only hub not on a card.

            Rows that navigate away or act on the session — Reset password,
            Copy, Billing, Log out — carry their own control. They open nothing,
            so they are not levels of the chain and gain no chevron.
          -->
          <section class="flex items-center gap-4 pb-6">
            <UAvatar :src="sessionData?.user?.image ?? undefined" icon="i-lucide-user" alt="User avatar" class="size-14" :ui="{ icon: 'size-7' }" />
            <span class="text-sm font-semibold text-muted" title="Avatar is managed by your sign-in provider">Change photo</span>
          </section>

          <EditorNavigationList :groups="groups" :active-item="detailKey ?? undefined" @act="runRowAction" />
        </template>

        <template #detail>
          <UFormField v-if="openKey === 'name'" label="Display name">
            <UInput v-model="nameInput" size="xl" autofocus class="w-full" @input="nameTouched = true" @keydown.enter="saveDetail" />
          </UFormField>

          <div v-else-if="openKey === 'phone'" class="space-y-4">
            <p class="text-base text-muted">A code is sent over WhatsApp to confirm the number before it is saved.</p>
            <UFormField label="Phone number">
              <UInput v-model="phoneInput" size="xl" placeholder="+1234567890" autofocus class="w-full" @input="phoneTouched = true" @keydown.enter="saveDetail" />
            </UFormField>
          </div>

          <div v-else-if="openKey === 'delete'" class="space-y-4">
            <template v-if="deletionScheduledAt">
              <UAlert
                color="warning"
                variant="soft"
                icon="i-lucide-clock"
                title="Deletion scheduled"
                :description="`Your account, organization, site, locations and menu data are deleted on ${deletionDateLabel}. Everything keeps working until then, and your site stays online.`"
              />
              <UAlert v-if="deleteError" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="deleteError" />
            </template>
            <template v-else>
              <p class="text-base text-muted">This schedules your account, organization, site, locations and menu data for deletion in {{ graceDays }} days. Nothing is removed today, and you can cancel here until then.</p>
              <UAlert v-if="deleteError" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="deleteError" />
              <UFormField label="Type DELETE to confirm">
                <UInput v-model="deleteConfirmText" placeholder="DELETE" :disabled="deleting" autofocus class="w-full" @keydown.enter="saveDetail" />
              </UFormField>
            </template>
          </div>
        </template>
      </EditorPaneShell>
    </template>
  </UDashboardPanel>

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
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { authClient } from '~/lib/auth-client'
import { dashboardOrganizationParentKey } from '~/lib/components/workspace/dashboard/dashboardScopeHeaderContext'


const toast = useToast()
const route = useRoute()

// The frame comes first, and before any `await`: `useEditorFrame` provides and
// injects, which Vue binds only while setup is still synchronous.
const profilePath = computed(() => '/dashboard/account/profile')
const frame = useEditorFrame(profilePath)
const { sessionData, refresh: refreshSession } = await useAuthSession()

const organizationParent = inject(dashboardOrganizationParentKey, null)
const billingTo = computed(() => organizationParent?.value ? `${organizationParent.value.to}/settings/billing` : null)
const { signOut } = authClient

// listAccounts() doesn't expose a per-account email (only providerId/accountId/
// scopes) — there's no Google-specific email to show, so "connected" renders a
// generic label rather than implying we know a per-provider address. A failed
// lookup is shown distinctly from "not connected" too, since defaulting an
// error to false would misreport a real Google-linked account as unlinked.
const googleStatus = ref<'loading' | 'connected' | 'not-connected' | 'error'>('loading')
const GOOGLE_SUMMARIES = {
  loading: 'Checking…',
  connected: 'Connected',
  error: 'Unable to check connection status',
  'not-connected': 'Not connected',
} as const
const googleSummary = computed(() => GOOGLE_SUMMARIES[googleStatus.value])
onMounted(async () => {
  try {
    const { data, error } = await authClient.listAccounts()
    if (error) {
      googleStatus.value = 'error'
      return
    }
    googleStatus.value = data?.some(account => account.providerId === 'google') ? 'connected' : 'not-connected'
  } catch {
    googleStatus.value = 'error'
  }
})

async function handleSignOut() {
  // Preserve the current path across sign-out/sign-back-in like
  // middleware/account.ts and middleware/dashboard.global.ts already do for
  // session-expiry redirects.
  const redirect = route.fullPath
  await signOut()
  await navigateTo({ path: '/login', query: { redirect } })
}
// Display Name
const nameInput = ref(sessionData.value?.user?.name || '')
const nameDirty = computed(() => nameInput.value.trim() !== (sessionData.value?.user?.name || ''))
const nameSaving = ref(false)
const DETAIL_LABELS: Record<string, string> = { name: 'Display name', phone: 'Phone number', delete: 'Delete account' }
const detailKey = computed(() => frame.childSegment.value)
/**
 * With nothing open the pane still shows the first row rather than empty space:
 * the reference profile opens on its first section too. `has-detail` stays tied
 * to the route, so below `lg` a phone shows the index and no sheet to escape.
 */
const openKey = computed(() => detailKey.value ?? 'name')
const detailTitle = computed(() => DETAIL_LABELS[openKey.value])

// An unsupported row 404s rather than opening an empty pane.
watchEffect(() => {
  if (frame.rest.value.length > 1 || (detailKey.value && !(detailKey.value in DETAIL_LABELS))) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
})

const { preferences: notificationPreferences, load: loadNotificationPreferences } = useNotificationPreferences()
await loadNotificationPreferences()

/**
 * How many categories currently reach this person at all. The row previews the
 * state rather than the concept, so the index answers "am I being notified"
 * without opening the level.
 */
const notificationSummary = computed(() => {
  const preferences = notificationPreferences.value
  if (!preferences) return 'Manage what reaches you'
  const on = Object.values(preferences).filter(setting => setting.email || setting.whatsapp).length
  const total = Object.values(preferences).length
  if (on === total) return 'All categories on'
  if (on === 0) return 'All categories off'
  return `${on} of ${total} categories on`
})

const groups = computed<EditorNavigationGroup[]>(() => [
  {
    id: 'profile',
    label: 'Profile',
    items: [
      { id: 'name', label: 'Display name', summary: sessionData.value?.user?.name || 'Not set', placeholder: !sessionData.value?.user?.name, to: `${profilePath.value}/name` },
      {
        id: 'email',
        label: 'Email',
        summary: sessionData.value?.user?.email ?? '',
        ...(sessionData.value?.user?.emailVerified ? { meta: { label: 'Verified', tone: 'success' as const } } : {}),
        action: { label: 'Reset password', to: '/forgot-password' },
      },
      { id: 'google', label: 'Google', summary: googleSummary.value, placeholder: googleStatus.value === 'not-connected' },
      {
        id: 'phone',
        label: 'Phone number',
        summary: sessionData.value?.user?.phoneNumber || 'Not set',
        placeholder: !sessionData.value?.user?.phoneNumber,
        meta: sessionData.value?.user?.phoneNumberVerified
          ? { label: 'Verified', tone: 'success' as const }
          : { label: 'Not verified', tone: 'warning' as const },
        to: `${profilePath.value}/phone`,
      },
      { id: 'user-id', label: 'User ID', summary: sessionData.value?.user?.id ?? '', action: { label: 'Copy' } },
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    items: [
      { id: 'notifications', label: 'Notifications', summary: notificationSummary.value, to: `${profilePath.value}/notifications` },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      ...(billingTo.value
        ? [{ id: 'billing', label: 'Billing', summary: `Plan and payments for ${organizationParent?.value?.label ?? ''}`, action: { label: 'Open', to: billingTo.value } }]
        : []),
      {
        id: 'delete',
        label: 'Delete account',
        summary: deletionScheduledAt.value
          ? `Scheduled for ${deletionDateLabel.value}. Cancel any time before then.`
          : 'Removes your account, organization, site, locations and menu data.',
        to: `${profilePath.value}/delete`,
      },
      { id: 'log-out', label: 'Log out', summary: 'Sign out on this device.', action: { label: 'Log out' } },
    ],
  },
])

function runRowAction(id: string) {
  if (id === 'user-id') return void copyUserId()
  if (id === 'log-out') return void handleSignOut()
}

const saving = computed(() => openKey.value === 'name' ? nameSaving.value
  : openKey.value === 'phone' ? phoneSaving.value
  : openKey.value === 'delete' ? deleting.value
  : false)

const saveDisabled = computed(() => openKey.value === 'name' ? !nameDirty.value
  : openKey.value === 'phone' ? (!phoneDirty.value || !phoneInput.value.trim())
  : openKey.value === 'delete' ? (!deletionScheduledAt.value && deleteConfirmText.value !== 'DELETE')
  : true)

const saveLabel = computed(() => openKey.value === 'phone' ? 'Verify and save'
  : openKey.value === 'delete' ? (deletionScheduledAt.value ? 'Keep my account' : 'Schedule deletion')
  : undefined)

async function saveDetail() {
  if (saveDisabled.value) return
  if (openKey.value === 'name') return void await saveNameAndClose()
  if (openKey.value === 'phone') return void await requestPhoneVerify()
  if (openKey.value === 'delete') return void await (deletionScheduledAt.value ? keepAccount() : confirmDeleteAccount())
}

function closeDetail() {
  cancelEdit()
  void navigateTo(profilePath.value)
}

function cancelEdit() {
  nameInput.value = sessionData.value?.user?.name || ''
  phoneInput.value = sessionData.value?.user?.phoneNumber || ''
  nameTouched.value = false
  phoneTouched.value = false
  deleteConfirmText.value = ''
  deleteError.value = ''
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
  if (await saveName()) await navigateTo(profilePath.value)
}

// The session resolves asynchronously, so nameInput starts as '' before
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
    await navigateTo(profilePath.value)
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

// Deletion is scheduled, never immediate: the account and the organizations it
// owns alone carry a due instant, and the deletion-sweep task performs the
// deletion when it passes. Until then this row is the way back out.
const graceDays = ref(30)
const deletionScheduledAt = computed(() => {
  const scheduled = (sessionData.value?.user as { deletionScheduledAt?: string | Date | null } | undefined)?.deletionScheduledAt
  if (!scheduled) return null
  const at = new Date(scheduled)
  return Number.isNaN(at.getTime()) ? null : at
})
const deletionDateLabel = computed(() => deletionScheduledAt.value
  ? deletionScheduledAt.value.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  : '')

async function confirmDeleteAccount() {
  if (deleteConfirmText.value !== 'DELETE') return
  deleting.value = true
  deleteError.value = ''

  try {
    const res = await applicationFetch<{ success?: boolean; scheduled_at?: string; grace_days?: number }>('/api/user/delete-account', {
      method: 'POST',
      validate: (value): value is { success?: boolean; scheduled_at?: string; grace_days?: number } =>
        isRecord(value) && (value.success === undefined || typeof value.success === 'boolean'),
    })
    if (res?.success) {
      if (typeof res.grace_days === 'number') graceDays.value = res.grace_days
      await refreshSession()
      deleteConfirmText.value = ''
      toast.add({
        title: 'Deletion scheduled',
        description: res.scheduled_at
          ? `Everything is deleted on ${new Date(res.scheduled_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}. Cancel here any time before then.`
          : undefined,
        icon: 'i-lucide-clock',
        color: 'warning',
      })
    } else {
      deleteError.value = 'Scheduling the deletion failed. Please try again.'
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

async function keepAccount() {
  deleting.value = true
  deleteError.value = ''
  try {
    const res = await applicationFetch<{ success?: boolean }>('/api/user/delete-account', {
      method: 'DELETE',
      validate: (value): value is { success?: boolean } =>
        isRecord(value) && (value.success === undefined || typeof value.success === 'boolean'),
    })
    if (res?.success !== true) throw new Error('Cancelling the deletion failed. Please try again.')
    await refreshSession()
    toast.add({ title: 'Deletion cancelled', icon: 'i-lucide-circle-check', color: 'success' })
  } catch (_err) {
    const body = getDeleteErrorBody(_err instanceof Error ? _err : new Error(String(_err)))
    deleteError.value = body?.message ?? 'Cancelling the deletion failed. Please try again.'
  } finally {
    deleting.value = false
  }
}

useSeoMeta({ title: 'Account | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
