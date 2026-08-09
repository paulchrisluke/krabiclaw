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
          <div class="overflow-hidden rounded-xl border border-default">
            <NuxtLink
              v-for="(organization, index) in analytics.organizations"
              :key="organization.id"
              :to="`/admin/organizations/${organization.id}`"
              class="grid gap-3 border-b border-default bg-default px-5 py-4 transition-colors last:border-b-0 hover:bg-elevated/50 md:grid-cols-[40px_minmax(0,2fr)_repeat(3,minmax(100px,1fr))_auto] md:items-center"
            >
              <p class="hidden text-sm font-semibold text-muted md:block">{{ index + 1 }}</p>
              <div><p class="font-semibold text-highlighted">{{ organization.name }}</p><p class="text-xs text-muted">{{ organization.siteCount }} sites · {{ organization.locationCount }} locations</p></div>
              <div><p class="text-xs text-muted">Page views</p><p class="font-semibold">{{ formatNumber(organization.pageViews30d) }}</p></div>
              <div><p class="text-xs text-muted">Sessions</p><p class="font-semibold">{{ formatNumber(organization.sessions30d) }}</p></div>
              <div><p class="text-xs text-muted">Trend</p><p class="font-semibold" :class="trendClass(organization)">{{ trendLabel(organization) }}</p></div>
              <UIcon name="i-lucide-chevron-right" class="hidden size-4 text-muted md:block" />
            </NuxtLink>
          </div>
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
