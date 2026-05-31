<template>
  <UPage>
    <UPageBody class="space-y-6">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 class="text-xl font-semibold text-highlighted">Message Copy + Style Review</h1>
              <p class="text-sm text-muted">Preview current template copy/styles first, then optionally inspect delivery records.</p>
            </div>
            <UBadge color="neutral" variant="soft">
              {{ mode === 'preview' ? `${filteredPreviews.length} templates` : `${rows.length} records` }}
            </UBadge>
          </div>
        </template>

        <div class="mb-3 flex items-center gap-2 flex-wrap">
          <UButton size="sm" :variant="mode === 'preview' ? 'solid' : 'soft'" @click="mode = 'preview'">Template preview</UButton>
          <UButton size="sm" :variant="mode === 'logs' ? 'solid' : 'soft'" @click="mode = 'logs'">Delivery logs</UButton>
        </div>

        <div v-if="mode === 'preview'" class="flex items-center gap-2 flex-wrap">
          <UButton size="sm" :variant="previewAudience === 'all' ? 'solid' : 'soft'" @click="previewAudience = 'all'">All</UButton>
          <UButton size="sm" :variant="previewAudience === 'owner' ? 'solid' : 'soft'" @click="previewAudience = 'owner'">Owner</UButton>
          <UButton size="sm" :variant="previewAudience === 'guest' ? 'solid' : 'soft'" @click="previewAudience = 'guest'">Guest</UButton>
          <USeparator orientation="vertical" class="h-6" />
          <UButton size="sm" :variant="previewChannel === 'all' ? 'solid' : 'soft'" @click="previewChannel = 'all'">All channels</UButton>
          <UButton size="sm" :variant="previewChannel === 'email' ? 'solid' : 'soft'" @click="previewChannel = 'email'">Email</UButton>
          <UButton size="sm" :variant="previewChannel === 'whatsapp' ? 'solid' : 'soft'" @click="previewChannel = 'whatsapp'">WhatsApp</UButton>
          <UButton size="sm" color="neutral" variant="soft" :loading="loadingPreview" @click="reloadPreviews">Refresh templates</UButton>
        </div>

        <div v-else>
        <div class="flex items-center gap-2 flex-wrap mb-3">
          <UButton size="sm" :variant="reviewPreset === 'owner-email' ? 'solid' : 'soft'" @click="setPreset('owner-email')">Owner email</UButton>
          <UButton size="sm" :variant="reviewPreset === 'guest-email' ? 'solid' : 'soft'" @click="setPreset('guest-email')">Guest email</UButton>
          <UButton size="sm" :variant="reviewPreset === 'owner-whatsapp' ? 'solid' : 'soft'" @click="setPreset('owner-whatsapp')">Owner WhatsApp</UButton>
          <UButton size="sm" :variant="reviewPreset === 'guest-whatsapp' ? 'solid' : 'soft'" @click="setPreset('guest-whatsapp')">Guest WhatsApp</UButton>
          <UButton size="sm" variant="soft" @click="setPreset('all')">All</UButton>
        </div>

        <div class="grid md:grid-cols-6 gap-3">
          <UInput v-model="filters.organizationId" placeholder="Organization ID (optional)" />
          <UInput v-model="filters.siteId" placeholder="Site ID (optional)" />
          <USelect v-model="filters.channel" :items="channelOptions" />
          <USelect v-model="filters.status" :items="statusOptions" />
          <UInput v-model="filters.template" placeholder="Template (optional)" />
          <UInput v-model="filters.since" placeholder="Since ISO date (optional)" />
        </div>

        <div class="mt-3 flex items-center gap-3 flex-wrap">
          <UButton color="primary" :loading="loading" @click="load">Refresh</UButton>
          <UButton color="neutral" variant="soft" @click="applyDemoPreset">Use demo preset</UButton>
          <UInput v-model.number="filters.limit" type="number" min="1" max="500" class="w-28" />
          <p class="text-xs text-muted">Limit 1-500</p>
        </div>
        </div>
      </UCard>

      <UCard v-if="error" color="error" variant="soft">
        <p class="text-sm">{{ error }}</p>
      </UCard>

      <UCard v-if="mode === 'preview' && !loadingPreview && filteredPreviews.length === 0" variant="soft">
        <p class="text-sm text-muted">No template previews found. Refresh and try again.</p>
      </UCard>

      <UCard
        v-for="item in filteredPreviews"
        v-else-if="mode === 'preview'"
        :key="item.id"
      >
        <template #header>
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="flex items-center gap-2 flex-wrap">
              <UBadge :color="item.channel === 'email' ? 'info' : 'success'" variant="soft">{{ item.channel }}</UBadge>
              <UBadge :color="item.audience === 'owner' ? 'warning' : 'neutral'" variant="soft">{{ item.audience }}</UBadge>
              <span class="text-sm font-medium text-highlighted">{{ item.title }}</span>
            </div>
            <span class="text-xs text-muted">{{ item.template }}</span>
          </div>
        </template>
        <div class="space-y-3 text-sm">
          <p v-if="item.subject"><span class="text-muted">Subject:</span> {{ item.subject }}</p>
          <div v-if="item.channel === 'email'" class="space-y-2">
            <div class="rounded-md border border-default bg-default p-3 overflow-auto max-h-96">
              <iframe class="w-full min-h-96 bg-white rounded" sandbox="" :srcdoc="item.html || ''" title="Email template preview" />
            </div>
            <details>
              <summary class="cursor-pointer text-muted">Plain text version</summary>
              <pre class="text-xs whitespace-pre-wrap break-words mt-2 text-default">{{ item.text }}</pre>
            </details>
          </div>
          <div v-else class="rounded-md border border-default bg-elevated/40 p-3">
            <p class="text-default">{{ item.text }}</p>
            <p class="text-xs text-muted mt-2">WhatsApp display is template-constrained by Meta. This is the effective message summary preview.</p>
          </div>
        </div>
      </UCard>

      <UCard v-else-if="!loading && filteredRows.length === 0" variant="soft">
        <p class="text-sm text-muted">No records match this preset/filter yet. Click <strong>Refresh</strong> after sending a test notification.</p>
      </UCard>

      <UCard v-else v-for="row in filteredRows" :key="row.id">
        <template #header>
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-2 flex-wrap">
              <UBadge :color="row.channel === 'email' ? 'info' : row.channel === 'whatsapp' ? 'success' : 'neutral'" variant="soft">{{ row.channel }}</UBadge>
              <UBadge :color="statusColor(row.status)" variant="soft">{{ row.status }}</UBadge>
              <UBadge color="neutral" variant="subtle">{{ audienceOf(row.template) }}</UBadge>
              <span class="text-sm font-medium text-highlighted">{{ row.template }}</span>
            </div>
            <span class="text-xs text-muted">{{ row.created_at }}</span>
          </div>
        </template>

        <div class="space-y-2 text-sm">
          <p><span class="text-muted">Title:</span> <span class="text-default">{{ row.title || '—' }}</span></p>
          <p><span class="text-muted">Recipient:</span> <span class="text-default">{{ row.recipient || '—' }}</span></p>
          <p><span class="text-muted">Provider Message ID:</span> <span class="text-default break-all">{{ row.provider_message_id || '—' }}</span></p>
          <p v-if="row.error" class="text-error"><span class="text-muted">Error:</span> {{ summarizeError(row.error) }}</p>

          <div v-if="emailPreview(row)" class="space-y-3 rounded-lg border border-default p-3 bg-elevated/40">
            <p class="text-xs uppercase tracking-wide text-muted">Email preview</p>
            <p class="text-sm"><span class="text-muted">Subject:</span> {{ emailPreview(row)?.email_subject || row.title || '—' }}</p>
            <div class="rounded-md border border-default bg-default p-3 overflow-auto max-h-96">
              <iframe
                class="w-full min-h-80 bg-white rounded"
                sandbox=""
                :srcdoc="emailPreview(row)?.email_html || ''"
                title="Email HTML preview"
              />
            </div>
            <details>
              <summary class="cursor-pointer text-muted">Plain text fallback</summary>
              <pre class="text-xs whitespace-pre-wrap break-words mt-2 text-default">{{ emailPreview(row)?.email_text || '—' }}</pre>
            </details>
          </div>

          <div v-else-if="row.channel === 'whatsapp'" class="space-y-1 rounded-lg border border-default p-3 bg-elevated/40">
            <p class="text-xs uppercase tracking-wide text-muted">WhatsApp payload preview</p>
            <p class="text-sm text-default">{{ whatsappSummary(row) }}</p>
          </div>
          <div v-else class="space-y-1 rounded-lg border border-default p-3 bg-elevated/40">
            <p class="text-xs uppercase tracking-wide text-muted">No render preview</p>
            <p class="text-sm text-muted">This record is {{ row.channel }} and does not include a message body preview.</p>
          </div>

          <details>
            <summary class="cursor-pointer text-muted">Payload JSON</summary>
            <pre class="text-xs whitespace-pre-wrap break-words mt-2 text-default">{{ prettyPayload(row.payload) }}</pre>
          </details>
        </div>
      </UCard>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'platform', auth: false })

type Preview = {
  id: string
  audience: 'owner' | 'guest'
  channel: 'email' | 'whatsapp'
  template: string
  title: string
  subject?: string
  html?: string
  text: string
}

const mode = ref<'preview' | 'logs'>('preview')
const loading = ref(false)
const loadingPreview = ref(false)
const error = ref('')
const previews = ref<Preview[]>([])
const previewAudience = ref<'all' | 'owner' | 'guest'>('all')
const previewChannel = ref<'all' | 'email' | 'whatsapp'>('all')
const reviewPreset = ref<'owner-email' | 'guest-email' | 'owner-whatsapp' | 'guest-whatsapp' | 'all'>('owner-email')
const rows = ref<Array<{
  id: string
  organization_id: string | null
  site_id: string | null
  channel: string
  template: string
  title: string | null
  recipient: string | null
  payload: string | null
  provider_message_id: string | null
  status: string
  error: string | null
  sent_at: string | null
  created_at: string
}>>([])

const filters = ref({
  organizationId: 'org-demo',
  siteId: 'site-demo',
  channel: 'email',
  status: 'sent',
  template: '',
  since: '',
  limit: 100,
})

const channelOptions = [
  { label: 'All channels', value: 'all' },
  { label: 'Email', value: 'email' },
  { label: 'WhatsApp', value: 'whatsapp' },
  { label: 'Dashboard', value: 'dashboard' },
]

const statusOptions = [
  { label: 'Sent only', value: 'sent' },
  { label: 'Failed only', value: 'failed' },
  { label: 'Pending only', value: 'pending' },
  { label: 'All statuses', value: 'all' },
]

function audienceOf(template: string) {
  if (template.includes('customer_')) return 'guest'
  const ownerTemplates = new Set([
    'draft_published',
    'ai_action_complete',
    'low_credits',
    'new_contact_msg',
    'new_reservation',
    'reservation_cancelled',
    'domain_update',
    'new_review',
  ])
  if (ownerTemplates.has(template)) return 'owner'
  return 'system'
}

function isGuestTemplate(template: string) {
  return template.includes('customer_')
}

function isOwnerTemplate(template: string) {
  return !isGuestTemplate(template)
}

function statusColor(status: string) {
  if (status === 'sent') return 'success'
  if (status === 'failed') return 'error'
  if (status === 'pending') return 'warning'
  return 'neutral'
}

function prettyPayload(payload: string | null) {
  if (!payload) return 'null'
  try {
    return JSON.stringify(JSON.parse(payload), null, 2)
  } catch {
    return payload
  }
}

function parsePayload(payload: string | null): Record<string, string> | null {
  if (!payload) return null
  try {
    return JSON.parse(payload) as Record<string, string>
  } catch {
    return null
  }
}

function emailPreview(row: { channel: string; payload: string | null }) {
  if (row.channel !== 'email') return null
  const parsed = parsePayload(row.payload)
  if (!parsed) return null
  if (!parsed.email_html && !parsed.email_text && !parsed.email_subject) return null
  return {
    email_subject: parsed.email_subject ?? '',
    email_html: parsed.email_html ?? '',
    email_text: parsed.email_text ?? '',
  }
}

function summarizeError(error: string) {
  if (error.includes('rate_limit_exceeded')) return 'Provider rate limit exceeded (429).'
  if (error.length <= 180) return error
  return `${error.slice(0, 180)}…`
}

function whatsappSummary(row: { template: string; payload: string | null }) {
  const parsed = parsePayload(row.payload)
  if (!parsed) return `Template: ${row.template}`
  const guest = parsed.guest_name || parsed.email || parsed.to || 'recipient'
  const msg = parsed.message_preview || parsed.status || parsed.date || ''
  return msg ? `${guest} — ${msg}` : `Template: ${row.template}`
}

function applyDemoPreset() {
  filters.value.organizationId = 'org-demo'
  filters.value.siteId = 'site-demo'
  filters.value.channel = 'all'
  filters.value.status = 'sent'
  filters.value.template = ''
  filters.value.limit = 100
  filters.value.since = ''
}

function setPreset(preset: typeof reviewPreset.value) {
  reviewPreset.value = preset
  applyDemoPreset()
  if (preset === 'owner-email') {
    filters.value.channel = 'email'
  } else if (preset === 'guest-email') {
    filters.value.channel = 'email'
  } else if (preset === 'owner-whatsapp') {
    filters.value.channel = 'whatsapp'
  } else if (preset === 'guest-whatsapp') {
    filters.value.channel = 'whatsapp'
  } else {
    filters.value.channel = 'all'
  }
}

const filteredRows = computed(() => {
  return rows.value.filter((row) => {
    if (reviewPreset.value === 'owner-email') return row.channel === 'email' && isOwnerTemplate(row.template)
    if (reviewPreset.value === 'guest-email') return row.channel === 'email' && isGuestTemplate(row.template)
    if (reviewPreset.value === 'owner-whatsapp') return row.channel === 'whatsapp' && isOwnerTemplate(row.template)
    if (reviewPreset.value === 'guest-whatsapp') return row.channel === 'whatsapp' && isGuestTemplate(row.template)
    return true
  })
})

const filteredPreviews = computed(() => {
  return previews.value.filter((item) => {
    if (previewAudience.value !== 'all' && item.audience !== previewAudience.value) return false
    if (previewChannel.value !== 'all' && item.channel !== previewChannel.value) return false
    return true
  })
})

const { data: previewData, error: previewError, refresh: refreshPreviews, pending: pendingPreviews } = await useFetch<{ previews: Preview[] }>('/api/dev/notifications-preview', {
  default: () => ({ previews: [] }),
  server: true,
  lazy: false,
})

watchEffect(() => {
  loadingPreview.value = pendingPreviews.value
  previews.value = previewData.value?.previews || []
  if (previewError.value) {
    error.value = previewError.value.message || 'Failed to load template previews'
  }
})

async function reloadPreviews() {
  await refreshPreviews()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const query: Record<string, string> = { limit: String(filters.value.limit || 200) }
    if (filters.value.organizationId.trim()) query.organization_id = filters.value.organizationId.trim()
    if (filters.value.siteId.trim()) query.site_id = filters.value.siteId.trim()
    if (filters.value.channel !== 'all') query.channel = filters.value.channel
    if (filters.value.status !== 'all') query.status = filters.value.status
    if (filters.value.template.trim()) query.template = filters.value.template.trim()
    if (filters.value.since.trim()) query.since = filters.value.since.trim()

    const res = await $fetch<{ notifications: typeof rows.value }>('/api/dev/notifications', { query })
    rows.value = res.notifications || []
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load notifications'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await load()
})
</script>
