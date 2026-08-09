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

        <UTable :data="filteredOrganizations" :columns="organizationColumns" :loading="loading" empty="No organizations match your search.">
          <template #name-cell="{ row }">
            <div class="min-w-0"><p class="font-semibold text-highlighted">{{ row.original.name }}</p><p class="text-xs text-muted">{{ row.original.slug || row.original.id }}</p></div>
          </template>
          <template #pageViews30d-cell="{ row }">{{ formatNumber(row.original.pageViews30d) }}</template>
          <template #trend-cell="{ row }">
            <span class="font-semibold" :class="trendTone(row.original.pageViews30d, row.original.previousPageViews30d) === 'positive' ? 'text-success' : trendTone(row.original.pageViews30d, row.original.previousPageViews30d) === 'negative' ? 'text-error' : 'text-default'">{{ trendLabel(row.original.pageViews30d, row.original.previousPageViews30d) }}</span>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-1">
              <UButton label="Enter" icon="i-lucide-log-in" color="neutral" variant="ghost" size="xs" :disabled="!row.original.impersonationUserId" :loading="impersonatingOrganizationId === row.original.id" @click="openWorkspace(row.original)" />
              <UButton :to="`/admin/organizations/${row.original.id}`" label="View" icon="i-lucide-chevron-right" trailing color="neutral" variant="ghost" size="xs" />
            </div>
          </template>
        </UTable>
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
  impersonationUserId: string | null
  pageViews30d: number
  sessions30d: number
  previousPageViews30d: number
}

const toast = useToast()
const organizations = ref<Organization[]>([])
const loading = ref(true)
const search = ref('')
const impersonatingOrganizationId = ref<string | null>(null)
const { refreshSession } = useAuth()
const organizationColumns = [
  { accessorKey: 'name', header: 'Organization' },
  { accessorKey: 'siteCount', header: 'Sites' },
  { accessorKey: 'locationCount', header: 'Locations' },
  { accessorKey: 'pageViews30d', header: '30d views' },
  { id: 'trend', header: 'Trend' },
  { id: 'actions', header: '' },
]

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

async function openWorkspace(organization: Organization) {
  if (!organization.slug || !organization.impersonationUserId || impersonatingOrganizationId.value) return
  impersonatingOrganizationId.value = organization.id
  try {
    const { authClient } = await import('~/lib/auth-client')
    const result = await authClient.admin.impersonateUser({ userId: organization.impersonationUserId })
    if (result.error) throw new Error(result.error.message)
    await refreshSession()
    await navigateTo(`/dashboard/${organization.slug}`)
  } catch {
    toast.add({ title: 'Failed to enter organization workspace', color: 'error' })
  } finally {
    impersonatingOrganizationId.value = null
  }
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
