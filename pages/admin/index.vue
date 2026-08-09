<template>
  <UDashboardPanel id="admin-organizations">
    <template #header>
      <UDashboardNavbar title="Organizations">
        <template #leading><DashboardSidebarCollapseButton /></template>
        <template #trailing>
          <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-refresh-cw" aria-label="Refresh organizations" :loading="loading" @click="loadOrganizations" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <UCard v-for="stat in summary" :key="stat.label">
            <p class="text-xs font-semibold uppercase tracking-wide text-muted">{{ stat.label }}</p>
            <p class="mt-1 text-2xl font-bold text-highlighted">{{ stat.value }}</p>
          </UCard>
        </div>

        <UInput v-model="search" icon="i-lucide-search" placeholder="Search organizations" class="w-full max-w-md" />

        <UCard v-if="loading">
          <div class="space-y-3"><USkeleton v-for="i in 5" :key="i" class="h-16 rounded-lg" /></div>
        </UCard>
        <UCard v-else-if="filteredOrganizations.length === 0">
          <div class="py-8 text-center text-sm text-muted">No organizations match your search.</div>
        </UCard>
        <div v-else class="overflow-hidden rounded-xl border border-default">
          <NuxtLink
            v-for="organization in filteredOrganizations"
            :key="organization.id"
            :to="`/admin/organizations/${organization.id}`"
            class="grid gap-3 border-b border-default bg-default px-5 py-4 transition-colors last:border-b-0 hover:bg-elevated/50 md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(90px,1fr))_auto] md:items-center"
          >
            <div class="min-w-0">
              <p class="truncate font-semibold text-highlighted">{{ organization.name }}</p>
              <p class="truncate text-xs text-muted">{{ organization.slug || organization.id }}</p>
            </div>
            <div><p class="text-[11px] uppercase tracking-wide text-muted">Sites</p><p class="font-semibold text-default">{{ organization.siteCount }}</p></div>
            <div><p class="text-[11px] uppercase tracking-wide text-muted">Locations</p><p class="font-semibold text-default">{{ organization.locationCount }}</p></div>
            <div><p class="text-[11px] uppercase tracking-wide text-muted">30d views</p><p class="font-semibold text-default">{{ formatNumber(organization.pageViews30d) }}</p></div>
            <div><p class="text-[11px] uppercase tracking-wide text-muted">Trend</p><p class="font-semibold" :class="trendTone(organization.pageViews30d, organization.previousPageViews30d) === 'positive' ? 'text-success' : trendTone(organization.pageViews30d, organization.previousPageViews30d) === 'negative' ? 'text-error' : 'text-default'">{{ trendLabel(organization.pageViews30d, organization.previousPageViews30d) }}</p></div>
            <UIcon name="i-lucide-chevron-right" class="hidden size-4 text-muted md:block" />
          </NuxtLink>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Organizations | KrabiClaw Admin', robots: 'noindex, nofollow' })

interface Organization {
  id: string
  name: string
  slug: string | null
  createdAt: string
  siteCount: number
  locationCount: number
  memberCount: number
  pageViews30d: number
  sessions30d: number
  previousPageViews30d: number
}

const toast = useToast()
const organizations = ref<Organization[]>([])
const loading = ref(true)
const search = ref('')

const filteredOrganizations = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return organizations.value
  return organizations.value.filter(org => `${org.name} ${org.slug || ''}`.toLowerCase().includes(query))
})

const summary = computed(() => [
  { label: 'Organizations', value: formatNumber(organizations.value.length) },
  { label: 'Sites', value: formatNumber(organizations.value.reduce((sum, org) => sum + org.siteCount, 0)) },
  { label: 'Locations', value: formatNumber(organizations.value.reduce((sum, org) => sum + org.locationCount, 0)) },
  { label: '30d page views', value: formatNumber(organizations.value.reduce((sum, org) => sum + org.pageViews30d, 0)) },
])

function formatNumber(value: number) { return new Intl.NumberFormat().format(value) }
function trendPercent(current: number, previous: number) {
  if (previous === 0) return current > 0 ? null : 0
  return Math.round(((current - previous) / previous) * 100)
}
function trendLabel(current: number, previous: number) {
  const trend = trendPercent(current, previous)
  return trend === null ? 'New' : `${trend > 0 ? '+' : ''}${trend}%`
}
function trendTone(current: number, previous: number) {
  const trend = trendPercent(current, previous)
  if (trend === null || trend > 0) return 'positive'
  if (trend < 0) return 'negative'
  return 'neutral'
}

async function loadOrganizations() {
  loading.value = true
  try {
    const response = await applicationFetch<{ organizations: Organization[] }>('/api/admin/portfolio', {
      validate: (value): value is { organizations: Organization[] } => isRecord(value) && Array.isArray(value.organizations),
    })
    organizations.value = response.organizations
  } catch {
    toast.add({ title: 'Failed to load organizations', color: 'error' })
  } finally {
    loading.value = false
  }
}

onMounted(loadOrganizations)
</script>
