<template>
  <DashboardLeafPanel
    id="integration-facebook"
    title="Facebook"
    :ready="!pending"
    :saving="saving"
    :disabled="!accountId || !chosenPage || (chosenPage === data?.connection?.page_id && accountId === data?.connection?.account_id)"
    :error="error || loadFailure"
    :footer="choices.length > 0"
    save-label="Connect this Page"
    @cancel="chosenPage = data?.connection?.page_id"
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

      <UFormField v-if="accountOptions.length" label="Facebook account">
        <USelectMenu v-model="accountId" :items="accountOptions" value-key="value" placeholder="Choose a Facebook account" size="xl" class="w-full" />
      </UFormField>
      <UButton icon="i-simple-icons-facebook" variant="outline" :loading="linking" @click="link">{{ accountOptions.length ? 'Link another Facebook account' : 'Connect Facebook' }}</UButton>

      <p v-if="data.error" class="text-sm text-error">{{ data.error }}</p>
      <URadioGroup v-if="choices.length" v-model="chosenPage" legend="Which Page is this business?" :items="choices" variant="card" size="xl" />
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { INTEGRATION_SCOPES } from '~/shared/organization-settings'
import { integrationsKey } from '../integrations.vue'

definePageMeta({ layout: 'dashboard' })

interface FacebookLeaf {
  account_id: string | null
  connection: { account_id: string; page_id: string; page_name: string; status: string } | null
  choices: Array<{ id: string; name: string }>
  error: string | null
}

const integrations = inject(integrationsKey)!
const dashboardApi = useDashboardApi()
const route = useRoute()
const api = `/api/organizations/${integrations.organizationId}/integrations/facebook`
const linked = useLinkedAccounts('facebook', INTEGRATION_SCOPES.facebook)

const isLeaf = (value: unknown): value is FacebookLeaf =>
  isRecord(value) && (value.account_id === null || typeof value.account_id === 'string')
  && (value.connection === null || isRecord(value.connection)) && Array.isArray(value.choices)
const isSuccess = (value: unknown): value is { success: true } => isRecord(value) && value.success === true

// The account is the tenant's choice, never guessed: the one this site already
// uses, or one of their own linked Facebook accounts they pick here.
const accountId = ref<string | undefined>()
const { data, pending, refresh, error: loadError } = await useAsyncData(
  () => `integration-facebook:${integrations.organizationId}:${accountId.value ?? ''}`,
  () => dashboardApi(`${api}/pages`, { query: accountId.value ? { account_id: accountId.value } : {}, validate: isLeaf }),
  { lazy: true, watch: [accountId] },
)
watch(data, value => { accountId.value ??= value?.account_id ?? undefined }, { immediate: true })

const accountOptions = computed(() => {
  const own = (linked.data.value ?? []).map(account => ({ label: account.label, value: account.id }))
  const current = data.value?.connection?.account_id
  return current && !own.some(option => option.value === current)
    ? [{ label: 'Another member\'s Facebook account', value: current }, ...own]
    : own
})

const choices = computed(() => (data.value?.choices ?? []).map(page => ({ value: page.id, label: page.name })))
const chosenPage = ref<string | undefined>()
watch(data, value => { chosenPage.value = value?.connection?.page_id }, { immediate: true })

const loadFailure = computed(() => loadError.value ? getErrorMessage(loadError.value, 'Could not load Facebook.')
  : linked.error.value ? getErrorMessage(linked.error.value, 'Could not load your linked Facebook accounts.') : '')
// Better Auth returns here with `?error=` when linking did not finish.
const error = ref(typeof route.query.error === 'string' ? `Facebook did not finish connecting (${route.query.error}). Try again.` : '')
const saving = ref(false)
const linking = ref(false)
const disconnecting = ref(false)

async function link() {
  linking.value = true
  error.value = ''
  try {
    await linked.link(route.path)
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not start the Facebook connection.')
    linking.value = false
  }
}

async function choosePage() {
  if (!chosenPage.value || !accountId.value) return
  saving.value = true
  error.value = ''
  try {
    await dashboardApi(`${api}/select`, { method: 'POST', body: { account_id: accountId.value, page_id: chosenPage.value }, validate: isSuccess })
    await Promise.all([refresh(), integrations.refresh()])
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
    accountId.value = undefined
    await Promise.all([refresh(), integrations.refresh()])
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not disconnect Facebook.')
  } finally {
    disconnecting.value = false
  }
}
</script>
