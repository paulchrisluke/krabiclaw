<template>
  <UDashboardPanel id="site-domains">
    <template #header>
      <UDashboardNavbar title="Domains">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-plus" size="sm" @click="openAddModal">Add domain</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto max-w-5xl space-y-4">
        <UCard>
          <div v-if="loading" class="space-y-3">
            <USkeleton v-for="i in 3" :key="i" class="h-16 rounded-md" />
          </div>

          <UEmpty
            v-else-if="domainGroups.length === 0"
            icon="i-lucide-globe"
            title="No custom domains"
            description="Add a paid-plan domain when you are ready to connect one."
          />

          <div v-else class="divide-y divide-default">
            <div
              v-for="group in domainGroups"
              :key="group.id"
            >
              <div class="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <UButton
                  color="neutral"
                  variant="ghost"
                  class="-mx-2 min-w-0 justify-start px-2"
                  :trailing-icon="expandedGroups[group.id] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  @click="toggleGroup(group.id)"
                >
                  <span class="flex min-w-0 flex-col items-start gap-1 text-left">
                    <span class="flex min-w-0 items-center gap-2">
                      <span class="truncate font-mono text-sm font-medium text-highlighted">{{ group.domain }}</span>
                      <UBadge v-if="group.role === 'canonical'" label="Primary" color="primary" variant="soft" size="xs" />
                    </span>
                    <span v-if="group.www_domain_id" class="text-xs text-muted">www -> {{ group.root_domain }}</span>
                  </span>
                </UButton>

                <div class="flex shrink-0 items-center gap-2">
                  <UBadge :label="statusLabel(group.status)" :color="statusColor(group.status)" variant="soft" />
                  <UButton
                    v-if="primaryAction(group)"
                    size="sm"
                    :icon="primaryAction(group)?.icon"
                    :color="primaryAction(group)?.color"
                    :variant="primaryAction(group)?.variant"
                    :loading="syncingGroupId === group.id || promotingGroupId === group.id"
                    @click="runPrimaryAction(group)"
                  >
                    {{ primaryAction(group)?.label }}
                  </UButton>
                  <UDropdownMenu :items="domainMenuItems(group)" :content="{ align: 'end' }">
                    <UButton icon="i-lucide-more-horizontal" color="neutral" variant="ghost" size="sm" aria-label="Domain actions" />
                  </UDropdownMenu>
                </div>
              </div>

              <div v-if="expandedGroups[group.id]">
                <div class="space-y-3 pb-4">
                  <UAlert
                    v-if="group.warning || group.error"
                    :color="group.error ? 'error' : 'warning'"
                    variant="soft"
                    :title="group.error ? 'Action required' : 'Needs attention'"
                    :description="group.error || group.warning || undefined"
                  />

                  <UTable :data="group.records" :columns="recordColumns">
                    <template #type-cell="{ row }">
                      <UBadge :label="row.original.type" color="neutral" variant="soft" size="xs" />
                    </template>
                    <template #name-cell="{ row }">
                      <code class="block break-all text-xs text-highlighted">{{ row.original.name }}</code>
                    </template>
                    <template #value-cell="{ row }">
                      <code class="block max-w-full break-all text-xs text-muted">{{ row.original.value }}</code>
                    </template>
                    <template #actions-cell="{ row }">
                      <UTooltip text="Copy value">
                        <UButton icon="i-lucide-copy" color="neutral" variant="ghost" size="xs" @click="copy(row.original.value)" />
                      </UTooltip>
                    </template>
                  </UTable>

                  <div class="flex flex-col gap-2 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
                    <span>{{ group.last_synced_at ? `Last checked ${formatDateTime(group.last_synced_at)}` : 'Not checked yet' }}</span>
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="soft"
                      icon="i-lucide-refresh-cw"
                      :loading="syncingGroupId === group.id"
                      @click="syncGroup(group)"
                    >
                      Check now
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <UModal v-model:open="addModalOpen" title="Add domain">
        <template #body>
          <UForm :state="addForm" class="space-y-4" @submit="addDomain">
            <UFormField label="Domain" name="domain" :error="addError">
              <UInput v-model="addForm.domain" placeholder="example.com" class="w-full" :disabled="adding" />
            </UFormField>

            <UAlert
              v-if="liveCutoverWarning"
              color="warning"
              variant="soft"
              title="This domain may already be live"
              :description="liveCutoverWarning.message"
            />

            <UCheckbox
              v-if="liveCutoverWarning"
              v-model="addForm.acknowledge_live_cutover"
              label="I understand changing DNS can interrupt the current site until validation finishes."
            />

            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" :disabled="adding" @click="closeAddModal">Cancel</UButton>
              <UButton
                type="submit"
                :loading="adding"
                :disabled="!addForm.domain.trim() || Boolean(liveCutoverWarning && !addForm.acknowledge_live_cutover)"
              >
                Add domain
              </UButton>
            </div>
          </UForm>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

type DomainStatus = 'pending' | 'verifying' | 'active' | 'blocked' | 'failed' | 'stuck' | 'disabled' | 'deleted'

interface DnsRecord {
  type: string
  name: string
  value: string
  purpose: string
}

interface DomainRow {
  id: string
  domain: string
  type: 'subdomain' | 'custom'
  role: 'canonical' | 'secondary'
  status: DomainStatus
}

interface DomainGroup {
  id: string
  domain: string
  root_domain: string
  role: 'canonical' | 'secondary'
  status: DomainStatus
  primary_domain_id: string | null
  apex_domain_id: string | null
  www_domain_id: string | null
  domains: DomainRow[]
  records: DnsRecord[]
  warning: string | null
  error: string | null
  last_synced_at: string | null
}

interface DomainsResponse {
  domains: DomainRow[]
  domain_groups: DomainGroup[]
}

interface AddDomainResponse extends DomainsResponse {
  requested_hostnames: string[]
}

interface LiveCutoverWarning {
  hostname: string
  records: Array<{ type: string; value: string }>
  message: string
}

const toast = useToast()
const dashboard = useDashboardSite()
await dashboard.refresh()

const siteId = computed(() => dashboard.site.value?.id ?? null)
if (!siteId.value) {
  throw createError({ statusCode: 404, statusMessage: 'Site not found' })
}

const { trackDomainConnected } = useAnalytics()
const route = useRoute()

const loading = ref(true)
const adding = ref(false)
const syncingGroupId = ref<string | null>(null)
const promotingGroupId = ref<string | null>(null)
const deletingGroupId = ref<string | null>(null)
const domainGroups = ref<DomainGroup[]>([])
const expandedGroups = ref<Record<string, boolean>>({})
const addModalOpen = ref(false)
const addError = ref('')
const liveCutoverWarning = ref<LiveCutoverWarning | null>(null)
const addForm = reactive({
  domain: '',
  acknowledge_live_cutover: false,
})

const recordColumns = [
  { accessorKey: 'type', header: 'Type' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'value', header: 'Value' },
  { id: 'actions', header: '' },
]

async function loadDomains({ background = false }: { background?: boolean } = {}) {
  if (!siteId.value) return
  if (!background) loading.value = true
  try {
    const response = import.meta.server
      ? await loadDomainsForServer(siteId.value)
      : await $fetch<DomainsResponse>(`/api/sites/${siteId.value}/domains`)
    domainGroups.value = response.domain_groups ?? []
  } catch {
    if (!background) toast.add({ description: 'Failed to load domains', color: 'error' })
  } finally {
    if (!background) loading.value = false
  }
}

async function loadDomainsForServer(siteId: string): Promise<DomainsResponse> {
  const requestEvent = useRequestEvent()
  if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request event not available' })
  const [{ cloudflareEnv }, { domainInstructions, getDomainEvents, getSiteDomains, groupCustomDomains }] = await Promise.all([
    import('~/server/utils/api-response'),
    import('~/server/utils/domains'),
  ])
  const env = cloudflareEnv(requestEvent)
  if (!env.db || !env.DB) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  const domains = await getSiteDomains(env.DB, siteId)
  const enriched = []
  for (const domain of domains) {
    enriched.push({
      ...domain,
      instructions: domainInstructions(domain),
      events: domain.type === 'custom' ? await getDomainEvents(env.DB, domain.id) : [],
    })
  }
  return { domains: enriched, domain_groups: groupCustomDomains(domains) }
}

function openAddModal() {
  addModalOpen.value = true
}

function resetAddModal() {
  addError.value = ''
  liveCutoverWarning.value = null
  addForm.domain = ''
  addForm.acknowledge_live_cutover = false
}

function closeAddModal() {
  addModalOpen.value = false
  resetAddModal()
}

async function addDomain() {
  if (!siteId.value || !addForm.domain.trim()) return
  adding.value = true
  addError.value = ''
  try {
    const response = await $fetch<AddDomainResponse>(`/api/sites/${siteId.value}/domains`, {
      method: 'POST',
      body: {
        domain: addForm.domain.trim(),
        include_www: true,
        acknowledge_live_cutover: addForm.acknowledge_live_cutover,
      },
    })
    domainGroups.value = mergeGroups(domainGroups.value, response.domain_groups ?? [])
    const newGroup = response.domain_groups?.[0]
    if (newGroup) expandedGroups.value[newGroup.id] = true
    trackDomainConnected(addForm.domain.trim(), siteId.value)
    toast.add({ description: 'Domain added', color: 'success' })
    closeAddModal()
  } catch (error) {
    const data = (error as { data?: { error?: string; live_cutover_warning?: LiveCutoverWarning } })?.data
    if (data?.live_cutover_warning) {
      liveCutoverWarning.value = data.live_cutover_warning
      addError.value = ''
    } else {
      liveCutoverWarning.value = null
      addError.value = data?.error ?? 'Failed to add domain'
    }
  } finally {
    adding.value = false
  }
}

function mergeGroups(current: DomainGroup[], incoming: DomainGroup[]) {
  const byId = new Map(current.map((group) => [group.id, group]))
  for (const group of incoming) byId.set(group.id, group)
  return Array.from(byId.values()).sort((a, b) => a.domain.localeCompare(b.domain))
}

function toggleGroup(groupId: string) {
  expandedGroups.value[groupId] = !expandedGroups.value[groupId]
}

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.add({ description: 'Copied', color: 'success' })
  } catch {
    toast.add({ description: 'Failed to copy', color: 'error' })
  }
}

function statusLabel(status: DomainStatus) {
  return {
    active: 'Active',
    pending: 'DNS required',
    verifying: 'Checking',
    stuck: 'Needs attention',
    failed: 'Failed',
    blocked: 'Blocked',
    disabled: 'Disabled',
    deleted: 'Deleted',
  }[status] ?? status
}

function statusColor(status: DomainStatus) {
  return {
    active: 'success',
    pending: 'warning',
    verifying: 'info',
    stuck: 'warning',
    failed: 'error',
    blocked: 'error',
    disabled: 'neutral',
    deleted: 'neutral',
  }[status] as 'success' | 'warning' | 'info' | 'error' | 'neutral'
}

function primaryAction(group: DomainGroup) {
  if (group.status === 'active' && group.role === 'canonical') return null
  if (group.status === 'active') return { label: 'Make primary', icon: 'i-lucide-star', color: 'primary' as const, variant: 'soft' as const }
  if (group.status === 'pending') return { label: 'Configure', icon: 'i-lucide-list-checks', color: 'neutral' as const, variant: 'soft' as const }
  if (group.status === 'verifying') return { label: 'Check now', icon: 'i-lucide-refresh-cw', color: 'neutral' as const, variant: 'soft' as const }
  if (group.status === 'stuck') return { label: 'Resync', icon: 'i-lucide-refresh-cw', color: 'warning' as const, variant: 'soft' as const }
  if (group.status === 'failed') return { label: 'Retry', icon: 'i-lucide-rotate-cw', color: 'error' as const, variant: 'soft' as const }
  return { label: 'Resolve', icon: 'i-lucide-circle-alert', color: 'error' as const, variant: 'soft' as const }
}

async function runPrimaryAction(group: DomainGroup) {
  if (group.status === 'active' && group.role !== 'canonical') {
    await makePrimary(group)
    return
  }
  if (group.status === 'pending' || group.status === 'blocked') {
    expandedGroups.value[group.id] = true
    return
  }
  await syncGroup(group)
}

async function syncGroup(group: DomainGroup) {
  if (!siteId.value || !group.primary_domain_id) return
  syncingGroupId.value = group.id
  try {
    await $fetch(`/api/sites/${siteId.value}/domains/${group.primary_domain_id}/sync`, { method: 'POST' })
    await loadDomains({ background: true })
    toast.add({ description: 'Domain checked', color: 'success' })
  } catch {
    toast.add({ description: 'Domain check failed', color: 'error' })
  } finally {
    syncingGroupId.value = null
  }
}

async function makePrimary(group: DomainGroup) {
  if (!siteId.value || !group.primary_domain_id) return
  promotingGroupId.value = group.id
  try {
    await $fetch(`/api/sites/${siteId.value}/domains/${group.primary_domain_id}`, {
      method: 'PATCH',
      body: { role: 'canonical' },
    })
    await loadDomains({ background: true })
    toast.add({ description: 'Primary domain updated', color: 'success' })
  } catch {
    toast.add({ description: 'Failed to update primary domain', color: 'error' })
  } finally {
    promotingGroupId.value = null
  }
}

async function deleteGroup(group: DomainGroup) {
  if (!siteId.value || !group.primary_domain_id || deletingGroupId.value) return
  if (!confirm(`Remove ${group.domain} from this site?`)) return
  deletingGroupId.value = group.id
  try {
    for (const domain of group.domains.filter((domain) => domain.type === 'custom')) {
      await $fetch(`/api/sites/${siteId.value}/domains/${domain.id}`, { method: 'DELETE' })
    }
    domainGroups.value = domainGroups.value.filter((candidate) => candidate.id !== group.id)
    toast.add({ description: 'Domain removed', color: 'success' })
  } catch {
    await loadDomains({ background: true })
    toast.add({ description: 'Failed to remove domain', color: 'error' })
  } finally {
    deletingGroupId.value = null
  }
}

function domainMenuItems(group: DomainGroup) {
  return [[
    { label: 'Visit', icon: 'i-lucide-external-link', to: `https://${group.domain}`, target: '_blank' },
    { label: 'Copy domain', icon: 'i-lucide-copy', onSelect: () => copy(group.domain) },
    { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => deleteGroup(group) },
  ]]
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

watch(() => route.params.siteSlug, () => {
  expandedGroups.value = {}
  void loadDomains()
})

watch(addModalOpen, (open) => {
  if (!open) resetAddModal()
})

await loadDomains()

useSeoMeta({ title: 'Domains | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
