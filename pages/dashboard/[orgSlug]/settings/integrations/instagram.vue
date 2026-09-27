<template>
  <DashboardLeafPanel
    id="integration-instagram"
    title="Instagram"
    :ready="integrations.summary.value !== undefined"
    :saving="saving"
    :disabled="!accountId"
    :error="error || loadFailure"
    :footer="accountOptions.length > 0"
    save-label="Connect this account"
    @cancel="accountId = undefined"
    @save="select"
  >
    <div class="space-y-6">
      <UCard variant="subtle">
        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="font-semibold text-highlighted">{{ instagram ? 'Connected' : 'Not connected' }}</p>
            <p class="mt-1 truncate text-sm text-muted">{{ instagram ? `@${instagram.username}` : 'Publish posts to your Instagram professional account and show its posts on your website.' }}</p>
            <p v-if="instagram?.status === 'error'" class="mt-1 text-sm text-error">The last sync failed. It is retried every hour; reconnect if it keeps failing.</p>
          </div>
          <UButton v-if="instagram" color="error" variant="ghost" icon="i-lucide-link-2-off" :loading="disconnecting" @click="disconnect">Disconnect</UButton>
        </div>
      </UCard>
      <UFormField v-if="accountOptions.length" label="Instagram account">
        <USelectMenu v-model="accountId" :items="accountOptions" value-key="value" placeholder="Choose an Instagram account" size="xl" class="w-full" />
      </UFormField>
      <UButton icon="i-lucide-instagram" variant="outline" :loading="linking" @click="link">{{ accountOptions.length ? 'Link another Instagram account' : 'Connect Instagram' }}</UButton>
      <p class="text-sm text-muted">Instagram connects on its own: it needs an Instagram professional (business or creator) account, not a Facebook Page.</p>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
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
    await linked.link(route.path)
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
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not disconnect Instagram.')
  } finally {
    disconnecting.value = false
  }
}
</script>
