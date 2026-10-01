<template>
  <DashboardLeafPanel
    id="integration-google-calendar"
    icon="i-lucide-calendar"
    title="Google Calendar"
    :ready="integrations.summary.value !== undefined"
    :saving="saving"
    :disabled="!accountId || !selected"
    :error="error || integrations.failure.value || loadFailure"
    :footer="choosing && Boolean(data?.account_id)"
    @cancel="keep"
    @save="select"
  >
    <p class="text-sm text-muted">Krabiclaw sends upcoming active bookings to one Google Calendar. Google events do not block availability. Notes and guest invitations are excluded.</p>
    <UAlert v-if="data?.calendar?.last_error" color="error" :description="data.calendar.last_error" />
    <UAlert v-if="data?.calendar?.status === 'disabled'" color="warning" description="Projection is disabled. Managed events are being removed; failed cleanup stays here until retried. Finish cleanup before selecting another calendar." />
    <UButton v-if="data?.calendar" color="neutral" variant="soft" :loading="saving" @click="retry">Sync upcoming / retry cleanup</UButton>
    <IntegrationConnection
      v-model:changing="changing"
      logo="i-lucide-calendar"
      noun="calendar"
      :connection="calendar && { name: calendar.calendar_name, connectedAt: calendar.connected_at, status: calendar.status }"
      :disconnecting="disconnecting"
      @disconnect="disconnect"
      @keep="keep"
    >
      <template v-if="data">
        <UFormField v-if="accountOptions.length" label="Google account">
          <USelectMenu v-model="accountId" :items="accountOptions" value-key="value" placeholder="Choose a Google account" size="xl" class="w-full" />
        </UFormField>
        <UButton v-if="accountOptions.length" icon="i-lucide-plus" color="neutral" variant="link" class="px-0" :loading="linking" @click="link">Link another Google account</UButton>
        <UButton v-else icon="i-simple-icons-google" size="xl" block :loading="linking" @click="link">Connect Google Calendar</UButton>

        <UFormField v-if="data.account_id" label="Google calendar" :error="data.error ?? undefined">
          <USelectMenu v-model="selected" :items="options" value-key="value" placeholder="Choose a writable calendar" size="xl" class="w-full" />
          <p v-if="!data.error && !options.length" class="mt-2 text-sm text-muted">This Google account has no writable calendars.</p>
        </UFormField>
        <UFormField label="Consultation calendar group">
          <USelectMenu v-model="group" :items="(data.groups ?? []).map(item => ({ label: item.calendar_group, value: item.calendar_group }))" value-key="value" placeholder="Choose an existing single-calendar group" class="w-full" />
        </UFormField>
        <UCheckbox v-model="reservations" label="Also mirror Reservations" />
        <p class="text-sm text-muted">Only Products enrolled in the selected allocation calendar group are mirrored. Other experience/class bookings are excluded. Disconnect removes all Krabiclaw-managed events, including past events. Finish cleanup before changing calendars.</p>
      </template>
      <USkeleton v-else-if="pending" class="h-14 rounded-xl" />
    </IntegrationConnection>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { INTEGRATION_SCOPES } from '~/shared/organization-settings'
import IntegrationConnection from '~/components/dashboard/IntegrationConnection.vue'
import { integrationsKey } from '../integrations.vue'

definePageMeta({ layout: 'dashboard' })

interface CalendarLeaf {
  account_id: string | null
  calendar: import('~/shared/organization-settings').GoogleCalendarIntegration | null
  groups: Array<{ calendar_group: string }>
  calendars: Array<{ id: string; summary: string }>
  error: string | null
}

const integrations = inject(integrationsKey)!
const dashboardApi = useDashboardApi()
const route = useRoute()
const api = `/api/organizations/${integrations.organizationId}/integrations/google-calendar`
const linked = useLinkedAccounts('google', INTEGRATION_SCOPES['google-calendar'])
const calendar = computed(() => integrations.summary.value?.google_calendar ?? null)

const isLeaf = (value: unknown): value is CalendarLeaf =>
  isRecord(value) && (value.account_id === null || typeof value.account_id === 'string') && Array.isArray(value.calendars)
  && Array.isArray(value.groups) && (value.calendar === null || isRecord(value.calendar))
const isSuccess = (value: unknown): value is { success: true } => isRecord(value) && value.success === true

// The account is the tenant's choice, never guessed: the one this site already
// uses, or one of their own linked Google accounts they pick here.
const accountId = ref<string | undefined>()
const { data, pending, refresh, error: loadError } = await useAsyncData(
  () => `integration-google-calendar:${integrations.organizationId}:${accountId.value ?? ''}`,
  () => dashboardApi(`${api}/calendars`, { query: accountId.value ? { account_id: accountId.value } : {}, validate: isLeaf }),
  { lazy: true, watch: [accountId] },
)
watch(data, value => { accountId.value ??= value?.account_id ?? undefined }, { immediate: true })

const accountOptions = computed(() => {
  const own = (linked.data.value ?? []).map(account => ({ label: account.label, value: account.id }))
  const current = data.value?.calendar?.account_id
  return current && !own.some(option => option.value === current)
    ? [{ label: 'Another member\'s Google account', value: current }, ...own]
    : own
})

const selected = ref<string | undefined>()
const group = ref<string | undefined>()
const reservations = ref(false)
watch(data, value => { group.value = value?.calendar?.calendar_group ?? undefined; reservations.value = value?.calendar?.include_reservations ?? false }, { immediate: true })
watch(data, value => { selected.value = value?.calendar?.calendar_id }, { immediate: true })

// Linking another account while changing comes back with the picker still open.
const changing = ref(route.query.change === '1')
const choosing = computed(() => !calendar.value || changing.value)
function keep() {
  changing.value = false
  accountId.value = data.value?.calendar?.account_id
  selected.value = data.value?.calendar?.calendar_id
  group.value = data.value?.calendar?.calendar_group ?? undefined
  reservations.value = data.value?.calendar?.include_reservations ?? false
}
const options = computed(() => (data.value?.calendars ?? []).map(property => ({ label: `${property.summary}`, value: property.id })))

const loadFailure = computed(() => loadError.value ? getErrorMessage(loadError.value, 'Could not load Google Calendar.')
  : linked.error.value ? getErrorMessage(linked.error.value, 'Could not load your linked Google accounts.') : '')
// Better Auth returns here with `?error=` when linking did not finish.
const error = ref(typeof route.query.error === 'string' ? `Google did not finish connecting (${route.query.error}). Try again.` : '')
const saving = ref(false)
const linking = ref(false)
const disconnecting = ref(false)

async function link() {
  linking.value = true
  error.value = ''
  try {
    // Offline access with consent is what makes Google issue the refresh
    // token Better Auth keeps the connection alive with.
    await linked.link(changing.value ? `${route.path}?change=1` : route.path, { access_type: 'offline', prompt: 'consent' })
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not start the Google connection.')
    linking.value = false
  }
}

async function select() {
  const selection = data.value?.calendars.find(candidate => candidate.id === selected.value)
  if (!selection || !accountId.value) return
  saving.value = true
  error.value = ''
  try {
    await dashboardApi(`${api}/select`, { method: 'POST', body: { account_id: accountId.value, calendar_id: selection.id, calendar_group: group.value ?? null, include_reservations: reservations.value }, validate: isSuccess })
    await Promise.all([refresh(), integrations.refresh()])
    changing.value = false
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not choose that calendar.')
  } finally {
    saving.value = false
  }
}

async function disconnect() {
  disconnecting.value = true
  error.value = ''
  try {
    await dashboardApi(`${api}/disconnect`, { method: 'POST', validate: isSuccess })
    accountId.value = undefined
    await Promise.all([refresh(), integrations.refresh()])
    changing.value = false
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not disconnect Google Calendar.')
  } finally {
    disconnecting.value = false
  }
}
async function retry() {
  saving.value = true
  error.value = ''
  try {
    await dashboardApi(`${api}/sync`, { method: 'POST', validate: isSuccess })
    await Promise.all([refresh(), integrations.refresh()])
  } catch (cause) { error.value = getErrorMessage(cause, 'Could not retry calendar sync.') }
  finally { saving.value = false }
}
</script>

