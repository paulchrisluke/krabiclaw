<template>
  <DashboardLeafPanel
    id="integration-instagram"
    icon="i-skill-icons-instagram"
    title="Instagram"
    :ready="integrations.summary.value !== undefined"
    :saving="saving"
    :disabled="!accountId || accountId === instagram?.account_id"
    :error="error || integrations.failure.value || loadFailure"
    :footer="choosing && accountOptions.length > 0"
    save-label="Connect this account"
    @cancel="keep"
    @save="select"
  >
    <IntegrationConnection
      v-model:changing="changing"
      logo="i-skill-icons-instagram"
      noun="account"
      :connection="instagram && { name: `@${instagram.target_name}`, image: linkedImage, connectedAt: instagram.connected_at }"
      :disconnecting="disconnecting"
      @disconnect="disconnect"
      @keep="keep"
    >
      <UFormField v-if="accountOptions.length" label="Instagram account">
        <USelectMenu v-model="accountId" :items="accountOptions" value-key="value" placeholder="Choose an Instagram account" class="w-full" />
      </UFormField>
      <UButton v-if="accountOptions.length" icon="i-lucide-plus" color="neutral" variant="link" class="px-0" :loading="linking" @click="link">Link another Instagram account</UButton>
      <UButton v-else icon="i-lucide-instagram" size="xl" block :loading="linking" @click="link">Connect Instagram</UButton>
    </IntegrationConnection>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import IntegrationConnection from '~/components/dashboard/IntegrationConnection.vue'
import { integrationsKey } from '../integrations.vue'

definePageMeta({ layout: 'dashboard' })

const integrations = inject(integrationsKey)!
const dashboardApi = useDashboardApi()
const route = useRoute()
const api = `/api/organizations/${integrations.organizationId}/integrations/instagram`
const instagram = computed(() => integrations.summary.value?.instagram ?? null)
const linked = useLinkedAccounts('instagram')
const accountOptions = computed(() => (linked.data.value ?? []).map(account => ({ label: `@${account.label}`, value: account.id })))
const accountId = ref<string | undefined>()
// The picture is the provider's, and only the member who linked the account can read it.
const linkedImage = computed(() => (linked.data.value ?? []).find(account => account.id === instagram.value?.account_id)?.image ?? null)
// Linking another account while changing comes back with the picker still open.
const changing = ref(route.query.change === '1')
const choosing = computed(() => !instagram.value || changing.value)
const keep = () => {
  changing.value = false
  accountId.value = undefined
}

const isSuccess = (value: unknown): value is { success: true } => isRecord(value) && value.success === true

const loadFailure = computed(() => linked.error.value ? getErrorMessage(linked.error.value, 'Could not load your linked Instagram accounts.') : '')
// Better Auth returns here with `?error=` when linking did not finish.
const error = ref(typeof route.query.error === 'string' ? `Instagram did not finish connecting (${route.query.error}). Try again.` : '')
const saving = ref(false)
const linking = ref(false)
const disconnecting = ref(false)

async function link() {
  linking.value = true
  error.value = ''
  try {
    await linked.link(changing.value ? `${route.path}?change=1` : route.path)
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not start the Instagram connection.')
    linking.value = false
  }
}

async function select() {
  if (!accountId.value) return
  saving.value = true
  error.value = ''
  try {
    await dashboardApi(`${api}/select`, { method: 'POST', body: { account_id: accountId.value }, validate: isSuccess })
    await integrations.refresh()
    keep()
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not connect that Instagram account.')
  } finally {
    saving.value = false
  }
}

async function disconnect() {
  disconnecting.value = true
  error.value = ''
  try {
    await dashboardApi(`${api}/disconnect`, { method: 'POST', validate: isSuccess })
    await integrations.refresh()
    keep()
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not disconnect Instagram.')
  } finally {
    disconnecting.value = false
  }
}
</script>
