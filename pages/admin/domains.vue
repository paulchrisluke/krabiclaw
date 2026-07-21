<template>
  <UDashboardPanel id="admin-domains">
    <template #header>
      <UDashboardNavbar title="Domains">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <div class="flex flex-col sm:flex-row gap-2">
          <UInput v-model="domainSearch" placeholder="Search domains" icon="i-lucide-search" class="flex-1" />
          <UButton variant="soft" color="neutral" :loading="domainsLoading" @click="loadDomains">Refresh</UButton>
        </div>

        <div class="divide-y divide-default rounded-xl border border-default overflow-hidden">
          <div v-if="domainsLoading" class="px-5 py-4 text-sm text-muted">Loading…</div>
          <div v-else-if="domains.length === 0" class="px-5 py-4 text-sm text-muted">No custom domains found.</div>
          <div v-for="domain in domains" :key="domain.id" class="px-5 py-4">
            <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <p class="font-medium text-default">{{ domain.domain }}</p>
                  <UBadge :color="domain.status === 'active' ? 'success' : domain.status === 'failed' || domain.status === 'blocked' ? 'error' : 'warning'" variant="soft">{{ domain.status }}</UBadge>
                  <UBadge v-if="domain.role === 'canonical'" color="primary" variant="soft">Primary</UBadge>
                </div>
                <p class="mt-1 text-sm text-muted">{{ domain.site_name }} · {{ domain.organization_name }}</p>
                <p class="mt-0.5 text-xs text-muted">{{ domain.cloudflare_hostname_id || 'pending CF ID' }}</p>
                <p v-if="domain.error_message" class="mt-0.5 text-xs text-error">{{ domain.error_message }}</p>
              </div>
              <UButton size="sm" variant="soft" color="neutral" icon="i-lucide-refresh-cw" :loading="syncingDomainId === domain.id" @click="syncDomain(domain.id)">Sync</UButton>
            </div>
          </div>
        </div>

        <div v-if="domainEvents.length" class="space-y-2">
          <h3 class="text-sm font-semibold text-default">Recent domain events</h3>
          <p v-for="ev in domainEvents" :key="ev.id" class="rounded-lg bg-elevated px-4 py-2 text-xs text-muted">
            {{ formatDate(ev.created_at) }} · {{ ev.domain || '—' }} · {{ ev.event_type }} · {{ ev.message }}
          </p>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'admin' })
useSeoMeta({ title: 'Domains | KrabiClaw Admin', robots: 'noindex, nofollow' })

const toast = useToast()

interface Domain {
  id: string; domain: string; status: string; role: string
  site_name: string | null; organization_name: string | null
  cloudflare_hostname_id: string | null; error_message: string | null
}
interface DomainEvent { id: string; domain: string | null; event_type: string; message: string; created_at: string }

const domains = ref<Domain[]>([])
const domainEvents = ref<DomainEvent[]>([])
const domainSearch = ref('')
const domainsLoading = ref(false)
const syncingDomainId = ref<string | null>(null)

async function loadDomains() {
  domainsLoading.value = true
  try {
    const q = domainSearch.value.trim() ? `?q=${encodeURIComponent(domainSearch.value.trim())}` : ''
    const res = await $fetch<{ domains: Domain[]; events: DomainEvent[] }>(`/api/admin/domains${q}`)
    domains.value = res.domains ?? []
    domainEvents.value = res.events ?? []
  } catch {
    toast.add({ title: 'Failed to load domains', color: 'error' })
  } finally {
    domainsLoading.value = false
  }
}

async function syncDomain(id: string) {
  syncingDomainId.value = id
  try {
    await $fetch(`/api/admin/domains/${id}/sync`, { method: 'POST' })
    toast.add({ title: 'Domain synced', color: 'success' })
    await loadDomains()
  } catch {
    toast.add({ title: 'Failed to sync domain', color: 'error' })
  } finally {
    syncingDomainId.value = null
  }
}

onMounted(loadDomains)
</script>
