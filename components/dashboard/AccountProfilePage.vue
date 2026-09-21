<template>
  <NuxtPage v-if="frame.mode.value === 'yield'" />

  <template v-else>
    <UDashboardPanel
      id="account-profile"
      :class="hasDetail ? 'hidden lg:flex' : undefined"
      :default-size="32"
    >
      <template #header>
        <UDashboardNavbar title="Account settings" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full max-w-xl">
          <!--
            The reference's Account settings: a row per section, and the fields
            live inside the section as value rows that edit in place.
          -->
          <EditorNavigationList :groups="groups" :active-item="openKey" @act="runRowAction" />
        </div>
      </template>
    </UDashboardPanel>

    <!--
      The open row is the other column. It is drawn at `lg` even with nothing
      open, so the pair never collapses to one column on a wide screen.
    -->
    <UDashboardPanel id="account-profile-detail" :class="hasDetail ? undefined : 'hidden lg:flex'">
      <template #header>
        <UDashboardNavbar :title="detailTitle" :toggle="false">
          <template #leading>
            <DashboardNavbarLeading />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full max-w-2xl">
          <div v-if="openKey === 'personal'" class="divide-y divide-default">
            <!-- Photo -->
            <div class="flex items-start justify-between gap-4 py-5">
              <div class="flex min-w-0 items-center gap-4">
                <UAvatar :src="photoPreview ?? sessionData?.user?.image ?? undefined" icon="i-lucide-user" alt="" class="size-16" :ui="{ icon: 'size-8' }" />
                <div class="min-w-0">
                  <p class="font-semibold text-highlighted">Photo</p>
                  <p v-if="photoError" class="mt-1 text-sm text-error">{{ photoError }}</p>
                  <UInput v-if="editing === 'photo'" type="file" accept="image/*" class="mt-3 w-full" :disabled="photoSaving" @change="pickPhoto" />
                </div>
              </div>
              <UButton variant="link" color="neutral" class="shrink-0" :label="editing === 'photo' ? 'Cancel' : 'Edit'" @click="toggleEdit('photo')" />
            </div>

            <!-- Display name -->
            <div class="py-5">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="font-semibold text-highlighted">Display name</p>
                  <p v-if="editing !== 'name'" class="mt-1 text-sm" :class="sessionData?.user?.name ? 'text-muted' : 'italic text-dimmed'">{{ sessionData?.user?.name || 'Not provided' }}</p>
                </div>
                <UButton variant="link" color="neutral" class="shrink-0" :label="editing === 'name' ? 'Cancel' : sessionData?.user?.name ? 'Edit' : 'Add'" @click="toggleEdit('name')" />
              </div>
              <div v-if="editing === 'name'" class="mt-4 space-y-4">
                <UInput v-model="nameInput" autofocus class="w-full" @input="nameTouched = true" @keydown.enter="saveNameInline" />
                <p v-if="nameError" class="text-sm text-error">{{ nameError }}</p>
                <UButton label="Save" :loading="nameSaving" :disabled="!nameDirty" @click="saveNameInline" />
              </div>
            </div>

            <!-- WhatsApp number -->
            <div class="py-5">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="font-semibold text-highlighted">WhatsApp number</p>
                  <p v-if="editing !== 'phone'" class="mt-1 text-sm" :class="sessionData?.user?.phoneNumber ? 'text-muted' : 'italic text-dimmed'">
                    {{ sessionData?.user?.phoneNumber || 'Not provided' }}
                    <UBadge v-if="sessionData?.user?.phoneNumber" :color="sessionData?.user?.phoneNumberVerified ? 'success' : 'warning'" variant="subtle" size="sm" class="ms-2">{{ sessionData?.user?.phoneNumberVerified ? 'Verified' : 'Not verified' }}</UBadge>
                  </p>
                  <p class="mt-1 text-sm text-dimmed">Notifications and codes are sent over WhatsApp.</p>
                </div>
                <UButton variant="link" color="neutral" class="shrink-0" :label="editing === 'phone' ? 'Cancel' : sessionData?.user?.phoneNumber ? 'Edit' : 'Add'" @click="toggleEdit('phone')" />
              </div>
              <div v-if="editing === 'phone'" class="mt-4 space-y-4">
                <UInput v-model="phoneInput" type="tel" placeholder="+66..." autofocus class="w-full" @input="phoneTouched = true" @keydown.enter="requestPhoneVerify" />
                <p v-if="phoneError" class="text-sm text-error">{{ phoneError }}</p>
                <UButton label="Verify and save" :loading="phoneSaving" :disabled="!phoneDirty || !phoneInput.trim()" @click="requestPhoneVerify" />
              </div>
            </div>
          </div>

          <!--
            Login & security, laid out the way the reference does it: what you
            sign in with, the devices signed in now, and account deletion at the
            very bottom, behind its own confirmation and nowhere near Log out.
          -->
          <div v-else-if="openKey === 'login'" class="space-y-10">
            <section>
              <h2 class="text-lg font-semibold text-highlighted">Login</h2>
              <div class="mt-2 divide-y divide-default">
                <div class="flex items-start justify-between gap-4 py-4">
                  <div class="min-w-0">
                    <p class="font-semibold text-highlighted">Email</p>
                    <p class="mt-1 truncate text-sm text-muted">{{ sessionData?.user?.email }}</p>
                  </div>
                  <UBadge v-if="sessionData?.user?.emailVerified" color="success" variant="subtle">Verified</UBadge>
                  <UBadge v-else color="warning" variant="subtle">Not verified</UBadge>
                </div>
                <div class="flex items-start justify-between gap-4 py-4">
                  <div>
                    <p class="font-semibold text-highlighted">Password</p>
                    <p class="mt-1 text-sm text-muted">Sent to your email as a reset link.</p>
                  </div>
                  <NuxtLink to="/forgot-password" class="shrink-0 text-sm font-semibold text-highlighted underline underline-offset-4">Update</NuxtLink>
                </div>
                <div class="flex items-start justify-between gap-4 py-4">
                  <div>
                    <p class="font-semibold text-highlighted">Google</p>
                    <p class="mt-1 text-sm text-muted">{{ googleStatus === 'connected' ? 'Connected' : googleStatus === 'not-connected' ? 'Not connected' : googleStatus === 'error' ? 'Could not be checked' : '' }}</p>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h2 class="text-lg font-semibold text-highlighted">Device history</h2>
              <UAlert v-if="sessionsError" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="sessionsError" class="mt-3" />
              <div v-else class="mt-2 divide-y divide-default">
                <div v-for="device in sessions" :key="device.token" class="flex items-start justify-between gap-4 py-4">
                  <div class="min-w-0">
                    <p class="font-semibold text-highlighted">{{ describeDevice(device.userAgent) }}</p>
                    <UBadge v-if="device.current" color="neutral" variant="subtle" size="sm" class="mt-1">Current session</UBadge>
                    <p class="mt-1 text-sm text-muted">{{ device.ipAddress ? `${device.ipAddress} · ` : '' }}{{ formatExactDateTime(device.updatedAt, { includeTime: true }) }}</p>
                  </div>
                  <UButton
                    v-if="!device.current"
                    variant="link"
                    color="neutral"
                    label="Log out"
                    :loading="revoking === device.token"
                    @click="revokeDevice(device.token)"
                  />
                </div>
              </div>
            </section>

            <section>
              <h2 class="text-lg font-semibold text-highlighted">Delete account</h2>
              <div class="mt-3 space-y-4">
                <template v-if="deletionScheduledAt">
                  <UAlert
                    color="warning"
                    variant="soft"
                    icon="i-lucide-clock"
                    title="Deletion scheduled"
                    :description="`Everything is deleted on ${deletionDateLabel}. Your site stays online until then.`"
                  />
                  <UAlert v-if="deleteError" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="deleteError" />
                  <UButton color="neutral" variant="outline" label="Keep my account" :loading="deleting" @click="keepAccount" />
                </template>
                <template v-else>
                  <p class="text-sm text-muted">Your account, organization, site, locations and menu data are deleted in {{ graceDays }} days. You can cancel until then.</p>
                  <UAlert v-if="deleteError" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="deleteError" />
                  <UFormField label="Type DELETE to confirm">
                    <UInput v-model="deleteConfirmText" placeholder="DELETE" :disabled="deleting" class="w-full" />
                  </UFormField>
                  <UButton color="error" variant="soft" label="Schedule deletion" :disabled="deleteConfirmText !== 'DELETE'" :loading="deleting" @click="confirmDeleteAccount" />
                </template>
              </div>
            </section>
          </div>

          <URadioGroup
            v-else-if="openKey === 'appearance'"
            v-model="themeInput"
            legend="Theme"
            :items="THEME_OPTIONS"
            value-key="value"
            size="xl"
            variant="card"
          />
        </div>
      </template>

      <template v-if="hasCommit" #footer>
        <DashboardPanelFooter :save-label="saveLabel" :loading="saving" :disabled="saveDisabled" @cancel="closeDetail" @save="saveDetail" />
      </template>
    </UDashboardPanel>
  </template>

  <!-- OTP Verification Modal -->
  <UModal v-model:open="verifyModalOpen" :ui="{ content: 'max-w-sm' }">
    <template #content>
      <div class="p-6 space-y-4">
        <div>
          <h3 class="text-lg font-semibold text-highlighted">Enter the code</h3>
          <p class="mt-1 text-sm text-muted">Sent to {{ phoneInput }} on WhatsApp.</p>
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
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { authClient } from '~/lib/auth-client'


// The frame comes first, and before any `await`: `useEditorFrame` provides and
// injects, which Vue binds only while setup is still synchronous.
const profilePath = computed(() => '/dashboard/account/profile')
const frame = useEditorFrame(profilePath)
const hasDetail = computed(() => frame.mode.value === 'pair')
const session = authClient.useSession()
const sessionData = computed(() => session.value.data)
const refreshSession = () => session.value.refetch()

const { logOut } = useDashboardMenu()
const { formatExactDateTime } = useHumanTime()

// Whether this account can sign in with Google. It is shown in the Sign in
// leaf beside the address, because that is the concern it belongs to — it was
// never a setting of its own, since nothing here links or unlinks a provider.
// An error stays distinct from "not connected": defaulting a failed lookup to
// false would misreport a real Google-linked account as unlinked.
const googleStatus = ref<'loading' | 'connected' | 'not-connected' | 'error'>('loading')
onMounted(async () => {
  try {
    const { data, error } = await authClient.listAccounts()
    if (error) {
      googleStatus.value = 'error'
      return
    }
    googleStatus.value = data?.some((account: { providerId: string }) => account.providerId === 'google') ? 'connected' : 'not-connected'
  } catch {
    googleStatus.value = 'error'
  }
})

// Device history: the sessions Better Auth holds for this user. The current
// one is the token in hand; every other row can be logged out from here.
interface DeviceSession { token: string; userAgent?: string | null; ipAddress?: string | null; updatedAt: string | Date }
const sessions = ref<Array<DeviceSession & { current: boolean }>>([])
const sessionsError = ref<string | null>(null)
const revoking = ref<string | null>(null)

async function loadSessions() {
  const { data, error } = await authClient.listSessions()
  if (error) {
    sessionsError.value = error.message || 'Devices could not be loaded.'
    return
  }
  const current = sessionData.value?.session?.token
  sessions.value = ((data ?? []) as DeviceSession[])
    .map(item => ({ ...item, current: item.token === current }))
    .sort((a, b) => Number(b.current) - Number(a.current) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

async function revokeDevice(token: string) {
  revoking.value = token
  try {
    const { error } = await authClient.revokeSession({ token })
    if (error) throw new Error(error.message || 'Logging out that device failed.')
    await loadSessions()
  } catch (cause) {
    sessionsError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    revoking.value = null
  }
}

function describeDevice(userAgent?: string | null) {
  const ua = userAgent ?? ''
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : null
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : null
  return [os, browser].filter(Boolean).join(' · ') || 'Unknown device'
}

// Appearance is a preference of the person, kept on this device.
const { preference: themePreference, setPreference: setThemePreference } = usePlatformTheme()
type ThemePreference = 'system' | 'light' | 'dark'
const THEME_OPTIONS: { label: string; description: string; value: ThemePreference }[] = [
  { label: 'System', description: 'Follow your device appearance.', value: 'system' },
  { label: 'Light', description: 'Always use the light dashboard.', value: 'light' },
  { label: 'Dark', description: 'Always use the dark dashboard.', value: 'dark' },
]
const themeInput = ref<ThemePreference>(themePreference.value)
watch(themePreference, saved => { themeInput.value = saved })
const themeDirty = computed(() => themeInput.value !== themePreference.value)
// Photo
//
// Better Auth owns `user.image`, so the upload posts the file to our own route,
// which stores it in Cloudflare Images and writes the URL back through Better
// Auth. Saving happens on pick — there is one control and nothing to commit.
const photoPreview = ref<string | null>(null)
const photoSaving = ref(false)
const photoError = ref('')

async function pickPhoto(event: Event) {
  const file = (event.target as HTMLInputElement | null)?.files?.[0]
  if (!file) return
  photoSaving.value = true
  photoError.value = ''
  const body = new FormData()
  body.append('file', file)
  try {
    const result = await applicationFetch<{ image: string }>('/api/user/avatar', {
      method: 'POST',
      body,
      validate: (value): value is { image: string } => isRecord(value) && typeof value.image === 'string',
    })
    photoPreview.value = result.image
  } catch (cause) {
    photoError.value = cause instanceof Error ? cause.message : 'Upload failed. Please try again.'
    return
  } finally {
    photoSaving.value = false
  }
  // Separate from the upload: the photo is already stored by now, so a failed
  // refresh is a stale header, not a failed save, and must not read as one.
  await refreshSession()
  editing.value = null
}

// Display Name
const nameInput = ref(sessionData.value?.user?.name || '')
const nameDirty = computed(() => nameInput.value.trim() !== (sessionData.value?.user?.name || ''))
const nameSaving = ref(false)
const DETAIL_LABELS: Record<string, string> = {
  personal: 'Personal information',
  login: 'Login & security',
  appearance: 'Appearance',
}

// Which Personal information row is open for editing. One at a time, the way
// the reference expands one row and leaves the rest as they are.
const editing = ref<'photo' | 'name' | 'phone' | null>(null)
function toggleEdit(row: 'photo' | 'name' | 'phone') {
  if (editing.value === row) {
    cancelEdit()
    editing.value = null
    return
  }
  cancelEdit()
  editing.value = row
}
const detailKey = computed(() => frame.childSegment.value)
/**
 * With nothing open the pane still shows the first row rather than empty space:
 * the reference profile opens on its first section too. `has-detail` stays tied
 * to the route, so below `lg` a phone shows the index and no sheet to escape.
 */
const openKey = computed(() => detailKey.value ?? 'personal')
const detailTitle = computed(() => DETAIL_LABELS[openKey.value])

// The current token arrives with the session fetch; until it has, every
// device would read as another device, with a Log out it must not have.
watch(() => [openKey.value === 'login', sessionData.value?.session?.token] as const, ([open, token]) => { if (open && token) void loadSessions() }, { immediate: true })

// An unsupported row 404s rather than opening an empty pane.
watchEffect(() => {
  if (frame.rest.value.length > 1 || (detailKey.value && !(detailKey.value in DETAIL_LABELS))) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found' })
  }
})

const { preferences: notificationPreferences, load: loadNotificationPreferences } = useNotificationPreferences(() => sessionData.value?.user?.id)
await loadNotificationPreferences()

/** How many categories currently reach this person at all. */
const notificationSummary = computed(() => {
  const preferences = notificationPreferences.value
  if (!preferences) return ''
  const settings = Object.values(preferences)
  const on = settings.filter(setting => setting.email || setting.whatsapp).length
  return on === settings.length ? 'All on' : `${on} of ${settings.length} on`
})

const groups = computed<EditorNavigationGroup[]>(() => [
  {
    id: 'account',
    items: [
      { id: 'personal', label: 'Personal information', summary: [sessionData.value?.user?.name, sessionData.value?.user?.phoneNumber].filter(Boolean).join(' · ') || 'Name, photo, WhatsApp number', to: `${profilePath.value}/personal` },
      { id: 'login', label: 'Login & security', summary: sessionData.value?.user?.email ?? '', to: `${profilePath.value}/login` },
      { id: 'notifications', label: 'Notifications', summary: notificationSummary.value, to: `${profilePath.value}/notifications` },
      { id: 'appearance', label: 'Appearance', summary: `${themePreference.value.charAt(0).toUpperCase()}${themePreference.value.slice(1)} theme`, to: `${profilePath.value}/appearance` },
      { id: 'log-out', label: 'Log out', action: {} },
    ],
  },
])

function runRowAction(id: string) {
  if (id === 'log-out') logOut().catch(error => console.error('sign_out_failed', error))
}

// Personal information and Login & security carry their own controls on
// each row; only Appearance commits from the footer.
const hasCommit = computed(() => openKey.value === 'appearance')
const saving = computed(() => false)
const saveDisabled = computed(() => !themeDirty.value)
const saveLabel = computed(() => undefined)

async function saveDetail() {
  if (saveDisabled.value) return
  setThemePreference(themeInput.value)
  await navigateTo(profilePath.value)
}

const nameError = ref<string | null>(null)
const phoneError = ref<string | null>(null)


function closeDetail() {
  cancelEdit()
  void navigateTo(profilePath.value)
}

function cancelEdit() {
  nameInput.value = sessionData.value?.user?.name || ''
  phoneInput.value = sessionData.value?.user?.phoneNumber || ''
  nameTouched.value = false
  phoneTouched.value = false
  nameError.value = null
  phoneError.value = null
  themeInput.value = themePreference.value
  deleteConfirmText.value = ''
  deleteError.value = ''
}

async function saveName() {
  if (!nameDirty.value) return false
  nameSaving.value = true
  nameError.value = null
  try {
    await authClient.updateUser({ name: nameInput.value.trim() })
    await refreshSession()
    return true
  } catch (_err) {
    const msg = _err instanceof Error ? _err.message : String(_err)
    nameError.value = msg
    return false
  } finally {
    nameSaving.value = false
  }
}

async function saveNameInline() {
  if (await saveName()) editing.value = null
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
  phoneError.value = null
  try {
    const res = await authClient.phoneNumber.sendOtp({ phoneNumber: phoneInput.value.trim() })
    if (res.error) throw new Error(res.error.message || 'Failed to send OTP')
    
    otpCode.value = ''
    verifyError.value = ''
    verifyModalOpen.value = true
  } catch (_err) {
    const msg = _err instanceof Error ? _err.message : String(_err)
    phoneError.value = msg
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
    editing.value = null
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
  } catch (_err) {
    const body = getDeleteErrorBody(_err instanceof Error ? _err : new Error(String(_err)))
    deleteError.value = body?.message ?? 'Cancelling the deletion failed. Please try again.'
  } finally {
    deleting.value = false
  }
}

useSeoMeta({ title: 'Account settings | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
