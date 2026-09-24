<template>
  <DashboardLeafPanel id="integration-instagram" title="Instagram" :ready="integrations.summary.value !== undefined" :error="error" :footer="false">
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
      <UButton icon="i-lucide-instagram" :loading="connecting" @click="connect">{{ instagram ? 'Connect a different account' : 'Connect Instagram' }}</UButton>
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

const isAuthUrl = (value: unknown): value is { authUrl: string } => isRecord(value) && typeof value.authUrl === 'string'
const isSuccess = (value: unknown): value is { success: true } => isRecord(value) && value.success === true

const CALLBACK_ERRORS: Record<string, string> = {
  denied: 'Instagram was not connected: the permission request was declined.',
  error: 'Instagram did not finish connecting. Try again.',
  expired: 'That Instagram sign-in took too long. Try again.',
}
const error = ref(typeof route.query.instagram === 'string' ? CALLBACK_ERRORS[route.query.instagram] ?? '' : '')
const connecting = ref(false)
const disconnecting = ref(false)

async function connect() {
  connecting.value = true
  error.value = ''
  try {
    const { authUrl } = await dashboardApi(`${api}/auth`, { method: 'POST', validate: isAuthUrl })
    await navigateTo(authUrl, { external: true })
  } catch (cause) {
    error.value = getErrorMessage(cause, 'Could not start the Instagram connection.')
    connecting.value = false
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
