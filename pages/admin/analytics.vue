<template>
  <UDashboardPanel id="admin-analytics">
    <template #header>
      <UDashboardNavbar title="Client performance">
        <template #leading><DashboardSidebarCollapseButton /></template>
        <template #trailing><UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-refresh-cw" aria-label="Refresh analytics" :loading="loading" @click="loadAnalytics" /></template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="space-y-6">
        <div v-if="loading" class="grid grid-cols-2 gap-4 lg:grid-cols-4"><USkeleton v-for="i in 4" :key="i" class="h-24 rounded-xl" /></div>
        <template v-else-if="analytics">
          <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <UCard v-for="stat in stats" :key="stat.label">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">{{ stat.label }}</p>
              <p class="mt-1 text-2xl font-bold text-highlighted">{{ stat.value }}</p>
              <p v-if="stat.detail" class="mt-1 text-xs" :class="stat.tone === 'negative' ? 'text-error' : 'text-success'">{{ stat.detail }}</p>
            </UCard>
          </div>

          <div>
            <h2 class="text-lg font-semibold text-highlighted">Organization performance</h2>
            <p class="text-sm text-muted">Last 30 days, ranked by page views and compared with the preceding 30 days.</p>
          </div>
          <UTable :data="analytics.organizations" :columns="organizationColumns" :loading="loading" empty="No organization analytics yet.">
            <template #name-cell="{ row }"><div><p class="font-semibold text-highlighted">{{ row.original.name }}</p><p class="text-xs text-muted">{{ row.original.siteCount }} sites · {{ row.original.locationCount }} locations</p></div></template>
            <template #pageViews30d-cell="{ row }">{{ formatNumber(row.original.pageViews30d) }}</template>
            <template #sessions30d-cell="{ row }">{{ formatNumber(row.original.sessions30d) }}</template>
            <template #trend-cell="{ row }"><span class="font-semibold" :class="trendClass(row.original)">{{ trendLabel(row.original) }}</span></template>
            <template #actions-cell="{ row }"><UButton :to="`/admin/organizations/${row.original.id}`" label="View" icon="i-lucide-chevron-right" trailing color="neutral" variant="ghost" size="xs" /></template>
          </UTable>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Client performance | KrabiClaw Admin', robots: 'noindex, nofollow' })
interface Organization { id: string; name: string; siteCount: number; locationCount: number; pageViews30d: number; sessions30d: number; previousPageViews30d: number }
interface Analytics { totals: { organizations: number; sites: number; locations: number; pageViews30d: number; sessions30d: number; previousPageViews30d: number }; organizations: Organization[] }
const toast = useToast()
const analytics = ref<Analytics | null>(null)
const loading = ref(true)
const organizationColumns = [
  { accessorKey: 'name', header: 'Organization' },
  { accessorKey: 'pageViews30d', header: 'Page views' },
  { accessorKey: 'sessions30d', header: 'Sessions' },
  { id: 'trend', header: 'Trend' },
  { id: 'actions', header: '' },
]
function formatNumber(value: number) { return new Intl.NumberFormat().format(value) }
function trend(current: number, previous: number) { return previous === 0 ? (current > 0 ? null : 0) : Math.round(((current - previous) / previous) * 100) }
function trendLabel(org: Organization) { const value = trend(org.pageViews30d, org.previousPageViews30d); return value === null ? 'New traffic' : `${value > 0 ? '+' : ''}${value}%` }
function trendClass(org: Organization) { const value = trend(org.pageViews30d, org.previousPageViews30d); return value === null || value > 0 ? 'text-success' : value < 0 ? 'text-error' : 'text-default' }
const stats = computed(() => {
  const totals = analytics.value!.totals
  const change = trend(totals.pageViews30d, totals.previousPageViews30d)
  return [
    { label: '30d page views', value: formatNumber(totals.pageViews30d), detail: change === null ? 'New traffic' : `${change > 0 ? '+' : ''}${change}% vs prior 30d`, tone: change !== null && change < 0 ? 'negative' : 'positive' },
    { label: '30d sessions', value: formatNumber(totals.sessions30d) },
    { label: 'Client organizations', value: formatNumber(totals.organizations) },
    { label: 'Locations managed', value: formatNumber(totals.locations) },
  ]
})
async function loadAnalytics() {
  loading.value = true
  try { analytics.value = await applicationFetch<Analytics>('/api/admin/analytics', { validate: (value): value is Analytics => isRecord(value) && isRecord(value.totals) && Array.isArray(value.organizations) }) }
  catch { toast.add({ title: 'Failed to load client performance', color: 'error' }) }
  finally { loading.value = false }
}
onMounted(loadAnalytics)
</script>
