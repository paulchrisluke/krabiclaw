<template>
  <DashboardLeafPanel
    id="integration-discord"
    icon="i-logos-discord-icon"
    title="Discord"
    lead="Posts you publish to Discord appear in one channel, sent by that channel's webhook under its name and avatar."
    :saving="saving"
    :disabled="!webhookUrl.trim() || !label.trim()"
    :error="error || integrations.failure.value || healthFailure || connectionProblem"
    :save-label="discord ? 'Replace webhook' : 'Connect this channel'"
    @save="save"
  >
    <IntegrationConnection
      logo="i-logos-discord-icon"
      :connection="discord && { name: `#${discord.target_name}`, connectedAt: discord.connected_at }"
      :disconnecting="disconnecting"
      @disconnect="disconnect"
    />
    <!-- A webhook URL is a credential: it is typed, sent to the server, and never shown back. -->
    <div class="space-y-4" :class="discord ? 'mt-8' : 'mx-auto -mt-8 max-w-sm pb-16'">
      <p v-if="discord" class="text-sm text-muted">To post through another webhook, or after its URL was reset in Discord, paste the new URL.</p>
      <UFormField label="Webhook URL" help="In Discord: the channel's Edit Channel → Integrations → Webhooks → Copy Webhook URL.">
        <UInput v-model="webhookUrl" type="password" autocomplete="off" placeholder="https://discord.com/api/webhooks/…" class="w-full" />
      </UFormField>
      <UFormField label="Channel name" help="Discord does not say which channel a webhook posts to by name, so name it as you'd recognize it.">
        <UInput v-model="label" placeholder="announcements" maxlength="100" class="w-full" />
      </UFormField>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import IntegrationConnection from '~/components/dashboard/IntegrationConnection.vue'
import { integrationsKey } from '../integrations.vue'

definePageMeta({ layout: 'dashboard' })

const integrations = inject(integrationsKey)!
const dashboardApi = useDashboardApi()
const api = `/api/organizations/${integrations.organizationId}/integrations/discord`
const discord = computed(() => integrations.summary.value?.discord ?? null)

const webhookUrl = ref('')
const label = ref(discord.value?.target_name ?? '')
watch(discord, value => { label.value = value?.target_name ?? '' })

interface ConnectionHealth { channels: Array<{ channel: string; problems: Array<{ code: string; message: string }> }> }
const isHealth = (value: unknown): value is ConnectionHealth => isRecord(value) && Array.isArray(value.channels)
// The same check get_social_connections makes: Discord still accepts the webhook, and it still posts to this channel.
const { data: health, error: healthError, refresh: refreshHealth } = await useAsyncData(
  `integration-discord-health:${integrations.organizationId}`,
  () => discord.value
    ? dashboardApi('/api/integrations/social-connections', { query: { organizationId: integrations.organizationId }, validate: isHealth })
    : Promise.resolve(null),
  { watch: [discord] },
)
const connectionProblem = computed(() => health.value?.channels.find(channel => channel.channel === 'discord')?.problems
  .map(problem => problem.message).join(' ') ?? '')
const healthFailure = computed(() => healthError.value ? getErrorMessage(healthError.value, 'Could not check the Discord connection.') : '')

const isSuccess = (value: unknown): value is { success: true } => isRecord(value) && value.success === true
const error = ref('')
const saving = ref(false)
const disconnecting = ref(false)

async function save() {
  saving.value = true
  error.value = ''
  try {
    await dashboardApi(`${api}/connect`, {
      method: 'POST',
      body: { webhook_url: webhookUrl.value, label: label.value, ...(discord.value ? { expected_revision: discord.value.revision } : {}) },
      validate: isSuccess,
    })
    webhookUrl.value = ''
    await integrations.refresh()
    await refreshHealth()
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not connect that Discord webhook.')
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
    await refreshHealth()
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not disconnect Discord.')
  } finally {
    disconnecting.value = false
  }
}
</script>
