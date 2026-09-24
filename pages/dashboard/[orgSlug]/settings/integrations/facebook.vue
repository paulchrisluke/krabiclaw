<template>
  <DashboardLeafPanel
    id="integration-facebook"
    title="Facebook"
    :ready="!pending"
    :saving="saving"
    :disabled="!chosenPage"
    :error="error || (loadError ? getErrorMessage(loadError, 'Could not load Facebook.') : '')"
    :footer="choices.length > 0"
    save-label="Connect this Page"
    @cancel="chosenPage = undefined"
    @save="choosePage"
  >
    <div v-if="data" class="space-y-6">
      <UCard variant="subtle">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="font-semibold text-highlighted">{{ data.connection ? 'Connected' : 'Not connected' }}</p>
            <p class="mt-1 truncate text-sm text-muted">{{ data.connection?.page_name ?? 'Publish posts to your Facebook Page and show its posts on your website.' }}</p>
            <p v-if="data.connection?.status === 'error'" class="mt-1 text-sm text-error">The last sync failed. It is retried every hour; reconnect if it keeps failing.</p>
          </div>
          <UButton v-if="data.connection" color="error" variant="ghost" icon="i-lucide-link-2-off" :loading="disconnecting" @click="disconnect">Disconnect</UButton>
        </div>
      </UCard>

      <URadioGroup v-if="choices.length" v-model="chosenPage" legend="Which Page is this business?" :items="choices" variant="card" size="xl" />
      <UButton v-else icon="i-simple-icons-facebook" :loading="connecting" @click="connect">{{ data.connection ? 'Connect a different Page' : 'Connect Facebook' }}</UButton>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { integrationsKey } from '../integrations.vue'

definePageMeta({ layout: 'dashboard' })

interface FacebookLeaf {
  connection: { page_id: string; page_name: string; status: string } | null
  choices: Array<{ id: string; name: string }>
}

const integrations = inject(integrationsKey)!
const dashboardApi = useDashboardApi()
const route = useRoute()
const router = useRouter()
const api = `/api/organizations/${integrations.organizationId}/integrations/facebook`
// A callback that returned several Pages hands over the choice by handle; the tokens never leave the server.
const handle = computed(() => typeof route.query.handle === 'string' ? route.query.handle : '')

const isLeaf = (value: unknown): value is FacebookLeaf =>
  isRecord(value) && (value.connection === null || isRecord(value.connection)) && Array.isArray(value.choices)
const isAuthUrl = (value: unknown): value is { authUrl: string } => isRecord(value) && typeof value.authUrl === 'string'
const isSuccess = (value: unknown): value is { success: true } => isRecord(value) && value.success === true

const { data, pending, refresh, error: loadError } = await useAsyncData(() => `integration-facebook:${integrations.organizationId}:${handle.value}`,
  () => dashboardApi(`${api}/pages`, { query: handle.value ? { handle: handle.value } : {}, validate: isLeaf }), { lazy: true })

const choices = computed(() => (data.value?.choices ?? []).map(page => ({ value: page.id, label: page.name })))
const chosenPage = ref<string | undefined>()

const CALLBACK_ERRORS: Record<string, string> = {
  denied: 'Facebook was not connected: the permission request was declined.',
  error: 'Facebook did not finish connecting. Try again.',
  expired: 'That Facebook sign-in took too long. Try again.',
  no_pages: 'That Facebook account manages no Pages. Sign in with the account that manages the business Page.',
}
const error = ref(typeof route.query.fb === 'string' ? CALLBACK_ERRORS[route.query.fb] ?? '' : '')
if (route.query.fb === 'select_page' && !handle.value) error.value = CALLBACK_ERRORS.error!
watch(data, value => {
  if (handle.value && value && !value.choices.length && !value.connection) error.value = 'That Facebook sign-in has expired. Connect again.'
})
const saving = ref(false)
const connecting = ref(false)
const disconnecting = ref(false)

async function connect() {
  connecting.value = true
  error.value = ''
  try {
    const { authUrl } = await dashboardApi(`${api}/auth`, { method: 'POST', validate: isAuthUrl })
    await navigateTo(authUrl, { external: true })
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not start the Facebook connection.')
    connecting.value = false
  }
}

async function choosePage() {
  if (!chosenPage.value) return
  saving.value = true
  error.value = ''
  try {
    await dashboardApi(`${api}/select`, { method: 'POST', body: { handle: handle.value, page_id: chosenPage.value }, validate: isSuccess })
    await router.replace({ query: {} })
    await integrations.refresh()
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not connect that Page.')
  } finally {
    saving.value = false
  }
}

async function disconnect() {
  disconnecting.value = true
  error.value = ''
  try {
    await dashboardApi(`${api}/disconnect`, { method: 'POST', validate: isSuccess })
    await Promise.all([refresh(), integrations.refresh()])
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not disconnect Facebook.')
  } finally {
    disconnecting.value = false
  }
}
</script>
