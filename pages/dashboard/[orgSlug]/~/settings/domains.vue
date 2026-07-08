<template>
  <UPage>
    <UPageBody>
      <div class="mb-6 space-y-1">
        <h1 class="text-2xl font-semibold text-highlighted">Domains</h1>
        <p class="text-sm text-muted">Custom domain setup and DNS configuration for your site.</p>
      </div>
      <div class="grid gap-4">

        <!-- Current domains -->
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">Your domains</h2>
          </template>

          <div v-if="loading" class="space-y-3">
            <USkeleton v-for="i in 2" :key="i" class="h-14 rounded-lg" />
          </div>

          <div v-else-if="domains.length" class="divide-y divide-default">
            <div v-for="domain in domains" :key="domain.id" class="py-3 first:pt-0 last:pb-0">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-sm font-medium text-highlighted truncate">{{ domain.domain }}</span>
                    <UBadge v-if="domain.type === 'subdomain'" label="Default" color="neutral" variant="soft" size="xs" />
                    <UBadge v-if="domain.role === 'canonical'" label="Primary" color="primary" variant="soft" size="xs" />
                  </div>
                  <p class="mt-0.5 text-xs text-muted">{{ statusLabel(domain.status) }}</p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <UIcon
                    :name="statusIcon(domain.status)"
                    :class="statusIconColor(domain.status)"
                    class="size-4"
                  />
                  <UButton
                    v-if="domain.type === 'custom' && domain.status !== 'active'"
                    icon="i-lucide-refresh-cw"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :loading="syncingId === domain.id"
                    @click="syncDomain(domain.id)"
                  />
                  <UButton
                    v-if="domain.type === 'custom'"
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    size="xs"
                    :loading="deletingId === domain.id"
                    @click="deleteDomain(domain)"
                  />
                </div>
              </div>

              <!-- DNS instructions for pending custom domains -->
              <div v-if="domain.type === 'custom' && domain.status !== 'active'" class="mt-3 rounded-lg border border-default bg-muted/40 p-3 space-y-3">
                <p class="text-xs font-medium text-highlighted">Add these DNS records at your registrar</p>
                <div class="overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead>
                      <tr class="text-muted">
                        <th class="pb-1.5 text-left font-medium">Type</th>
                        <th class="pb-1.5 text-left font-medium pl-4">Name</th>
                        <th class="pb-1.5 text-left font-medium pl-4">Value</th>
                        <th class="pb-1.5 pl-4" />
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-default">
                      <!-- CNAME row -->
                      <tr v-if="domain.instructions?.cname">
                        <td class="py-1.5 font-mono text-highlighted">{{ domain.instructions.cname.type }}</td>
                        <td class="py-1.5 pl-4 font-mono text-highlighted">{{ domain.instructions.cname.name }}</td>
                        <td class="py-1.5 pl-4 font-mono text-muted max-w-48 truncate">{{ domain.instructions.cname.value }}</td>
                        <td class="py-1.5 pl-4">
                          <UButton icon="i-lucide-copy" color="neutral" variant="ghost" size="xs" @click="copy(domain.instructions.cname.value)" />
                        </td>
                      </tr>
                      <!-- SSL TXT rows (Cloudflare requires two values at the same name) -->
                      <tr v-for="(rec, i) in (domain.instructions?.ssl_records ?? (domain.instructions?.ssl ? [domain.instructions.ssl] : []))" :key="i">
                        <td class="py-1.5 font-mono text-highlighted">{{ rec.type }}</td>
                        <td class="py-1.5 pl-4 font-mono text-highlighted">{{ rec.name }}</td>
                        <td class="py-1.5 pl-4 font-mono text-muted max-w-48 truncate">{{ rec.value }}</td>
                        <td class="py-1.5 pl-4">
                          <UButton icon="i-lucide-copy" color="neutral" variant="ghost" size="xs" @click="copy(rec.value)" />
                        </td>
                      </tr>
                      <!-- Ownership TXT row -->
                      <tr v-if="domain.instructions?.ownership">
                        <td class="py-1.5 font-mono text-highlighted">{{ domain.instructions.ownership.type }}</td>
                        <td class="py-1.5 pl-4 font-mono text-highlighted">{{ domain.instructions.ownership.name }}</td>
                        <td class="py-1.5 pl-4 font-mono text-muted max-w-48 truncate">{{ domain.instructions.ownership.value }}</td>
                        <td class="py-1.5 pl-4">
                          <UButton icon="i-lucide-copy" color="neutral" variant="ghost" size="xs" @click="copy(domain.instructions.ownership.value)" />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p class="text-xs text-muted">{{ domain.instructions?.apex_note ?? `For the bare domain (no www), use your registrar's forwarding/redirect to https://www.${domain.domain.replace(/^www\./, '')}` }}</p>
                <p class="text-xs text-muted">SSL certificate issues automatically once all records resolve. Do not add any other records at <code>_acme-challenge.www</code> — multiple conflicting records will block validation.</p>
              </div>
            </div>
          </div>

          <p v-else class="text-sm text-muted">No domains found.</p>
        </UCard>

        <!-- Add custom domain -->
        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">Add custom domain</h2>
              <p class="mt-1 text-sm text-muted">Point your own domain to this site. Available on paid plans.</p>
            </div>
          </template>

          <div class="flex gap-2">
            <UInput
              v-model="newDomain"
              placeholder="potteryhousekrabi.com"
              class="flex-1"
              :disabled="adding"
              @keydown.enter="addDomain"
            />
            <UButton
              :loading="adding"
              :disabled="!newDomain.trim()"
              @click="addDomain"
            >
              Add domain
            </UButton>
          </div>
          <p v-if="addError" class="mt-2 text-sm text-red-500">{{ addError }}</p>
          <p class="mt-2 text-xs text-muted">We'll automatically provision SSL and show you the DNS records to add.</p>
        </UCard>

      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

interface DomainInstructions {
  cname?: { type: string; name: string; value: string }
  ssl?: { type: string; name: string; value: string }
  ssl_records?: Array<{ type: string; name: string; value: string }>
  ownership?: { type: string; name: string; value: string }
  apex_note?: string
}

interface Domain {
  id: string
  domain: string
  type: 'subdomain' | 'custom'
  role: 'canonical' | 'secondary'
  status: string
  instructions?: DomainInstructions
}

const toast = useToast()
const dashboard = useDashboardSite()
const { trackDomainConnected } = useAnalytics()

const loading = ref(true)
const domains = ref<Domain[]>([])
const newDomain = ref('')
const adding = ref(false)
const addError = ref('')
const syncingId = ref<string | null>(null)
const deletingId = ref<string | null>(null)

const siteId = computed(() => dashboard.siteId.value)

async function loadDomains() {
  if (!siteId.value) return
  loading.value = true
  try {
    const res = await $fetch<{ domains: Domain[] }>(`/api/sites/${siteId.value}/domains`)
    domains.value = res.domains
  } catch {
    toast.add({ description: 'Failed to load domains', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function addDomain() {
  if (!siteId.value || !newDomain.value.trim()) return
  adding.value = true
  addError.value = ''
  try {
    const res = await $fetch<{ domains: Domain[] }>(`/api/sites/${siteId.value}/domains`, {
      method: 'POST',
      body: { domain: newDomain.value.trim(), include_www: true }
    })
    domains.value.push(...res.domains)
    trackDomainConnected(newDomain.value.trim(), siteId.value)
    newDomain.value = ''
    toast.add({ description: 'Domain added — add the DNS records below to complete setup', color: 'success' })
  } catch (err: unknown) {
    const msg = (err as { data?: { error?: string } })?.data?.error ?? 'Failed to add domain'
    addError.value = msg
  } finally {
    adding.value = false
  }
}

async function syncDomain(domainId: string) {
  if (!siteId.value) return
  syncingId.value = domainId
  try {
    await $fetch(`/api/sites/${siteId.value}/domains/${domainId}/sync`, { method: 'POST' })
    await loadDomains()
  } catch {
    toast.add({ description: 'Sync failed', color: 'error' })
  } finally {
    syncingId.value = null
  }
}

async function deleteDomain(domain: Domain) {
  if (!siteId.value) return
  deletingId.value = domain.id
  try {
    await $fetch(`/api/sites/${siteId.value}/domains/${domain.id}`, { method: 'DELETE' })
    domains.value = domains.value.filter(d => d.id !== domain.id)
    toast.add({ description: `${domain.domain} removed`, color: 'success' })
  } catch {
    toast.add({ description: 'Failed to remove domain', color: 'error' })
  } finally {
    deletingId.value = null
  }
}

function copy(value: string) {
  navigator.clipboard.writeText(value)
  toast.add({ description: 'Copied', color: 'success' })
}

function statusLabel(status: string) {
  return { active: 'Active', pending: 'Pending DNS', verifying: 'Verifying', failed: 'Failed', blocked: 'Blocked' }[status] ?? status
}

function statusIcon(status: string) {
  return { active: 'i-lucide-circle-check', pending: 'i-lucide-clock', verifying: 'i-lucide-refresh-cw', failed: 'i-lucide-circle-x', blocked: 'i-lucide-ban' }[status] ?? 'i-lucide-circle'
}

function statusIconColor(status: string) {
  return { active: 'text-green-500', pending: 'text-amber-500', verifying: 'text-blue-500', failed: 'text-red-500', blocked: 'text-red-500' }[status] ?? 'text-muted'
}

let pollInterval: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  if (!dashboard.state.value) await dashboard.refresh()
  await loadDomains()
  // Poll every 15s while any custom domain is pending
  pollInterval = setInterval(() => {
    const hasPending = domains.value.some(d => d.type === 'custom' && d.status !== 'active')
    if (hasPending) loadDomains()
  }, 15000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})

useSeoMeta({ title: 'Domains | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
