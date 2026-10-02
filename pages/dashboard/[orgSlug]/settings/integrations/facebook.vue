<template>
  <DashboardLeafPanel
    id="integration-facebook"
    icon="i-logos-facebook"
    title="Facebook"
    :ready="integrations.summary.value !== undefined"
    :saving="saving"
    :disabled="!accountId || !chosenPage || (chosenPage === data?.connection?.target_id && accountId === data?.connection?.account_id)"
    :error="error || integrations.failure.value || loadFailure"
    :footer="choosing && choices.length > 0"
    save-label="Connect this Page"
    @cancel="keep"
    @save="choosePage"
  >
    <IntegrationConnection
      v-model:changing="changing"
      logo="i-logos-facebook"
      noun="Page"
      :connection="facebook && { name: facebook.target_name, connectedAt: facebook.connected_at }"
      :disconnecting="disconnecting"
      @disconnect="disconnect"
      @keep="keep"
    >
      <template v-if="data">
        <UFormField v-if="accountOptions.length" label="Facebook account">
          <USelectMenu v-model="accountId" :items="accountOptions" value-key="value" placeholder="Choose a Facebook account" size="xl" class="w-full" />
        </UFormField>
        <UButton v-if="accountOptions.length" icon="i-lucide-plus" color="neutral" variant="link" class="px-0" :loading="linking" @click="link">Link another Facebook account</UButton>
        <UButton v-else icon="i-simple-icons-facebook" size="xl" block :loading="linking" @click="link">Connect Facebook</UButton>

        <p v-if="data.error" class="text-sm text-error">{{ data.error }}</p>
        <URadioGroup v-if="choices.length" v-model="chosenPage" legend="Which Page is this business?" :items="choices" variant="card" size="xl" />
      </template>
      <USkeleton v-else-if="pending" class="h-14 rounded-xl" />
    </IntegrationConnection>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { INTEGRATION_SCOPES } from '~/shared/organization-settings'
import IntegrationConnection from '~/components/dashboard/IntegrationConnection.vue'
import { integrationsKey, type ConnectedIntegration } from '../integrations.vue'

definePageMeta({ layout: 'dashboard' })

interface FacebookLeaf {
  account_id: string | null
  connection: ConnectedIntegration | null
  choices: Array<{ id: string; name: string }>
  error: string | null
}

const integrations = inject(integrationsKey)!
const dashboardApi = useDashboardApi()
const route = useRoute()
const api = `/api/organizations/${integrations.organizationId}/integrations/facebook`
const linked = useLinkedAccounts('facebook', INTEGRATION_SCOPES.facebook)
const facebook = computed(() => integrations.summary.value?.facebook ?? null)

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
watch(data, value => { chosenPage.value = value?.connection?.target_id }, { immediate: true })

// Linking another account while changing comes back with the picker still open.
const changing = ref(route.query.change === '1')
const choosing = computed(() => !facebook.value || changing.value)
function keep() {
  changing.value = false
  accountId.value = data.value?.connection?.account_id
  chosenPage.value = data.value?.connection?.target_id
}

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
    await linked.link(changing.value ? `${route.path}?change=1` : route.path)
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
    changing.value = false
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
    changing.value = false
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not disconnect Facebook.')
  } finally {
    disconnecting.value = false
  }
}
</script>
