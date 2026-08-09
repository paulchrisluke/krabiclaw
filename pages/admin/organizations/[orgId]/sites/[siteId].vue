<template>
  <UDashboardPanel id="admin-site-locations">
    <template #header>
      <UDashboardNavbar :title="data?.site.brandName || data?.site.slug || 'Site'">
        <template #leading><DashboardSidebarCollapseButton /></template>
        <template #trailing><UButton :to="`/admin/organizations/${orgId}`" color="neutral" variant="ghost" size="xs" icon="i-lucide-arrow-left">Sites</UButton></template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="space-y-6">
        <div v-if="loading" class="space-y-3"><USkeleton v-for="i in 4" :key="i" class="h-20 rounded-xl" /></div>
        <template v-else-if="data">
          <div class="grid gap-4 sm:grid-cols-3">
            <UCard><p class="text-xs text-muted">30d page views</p><p class="mt-1 text-2xl font-bold">{{ formatNumber(data.site.pageViews30d) }}</p></UCard>
            <UCard><p class="text-xs text-muted">30d sessions</p><p class="mt-1 text-2xl font-bold">{{ formatNumber(data.site.sessions30d) }}</p></UCard>
            <UCard><p class="text-xs text-muted">Locations</p><p class="mt-1 text-2xl font-bold">{{ data.locations.length }}</p></UCard>
          </div>
          <div>
            <p class="text-sm text-muted">{{ data.organization.name }}</p>
            <h2 class="mt-1 text-xl font-semibold text-highlighted">Locations</h2>
          </div>
          <UCard v-if="data.locations.length === 0"><p class="text-sm text-muted">This site has no locations.</p></UCard>
          <div v-else class="overflow-hidden rounded-xl border border-default">
            <div v-for="location in data.locations" :key="location.id" class="grid gap-3 border-b border-default bg-default px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] sm:items-center">
              <div><p class="font-semibold text-highlighted">{{ location.title }}</p><p class="text-xs text-muted">{{ location.city || location.slug }}</p></div>
              <div><p class="text-xs text-muted">Google rating</p><p class="font-semibold">{{ location.rating ?? 'Not connected' }}</p></div>
              <div><p class="text-xs text-muted">Reviews</p><p class="font-semibold">{{ formatNumber(location.reviewCount) }}</p></div>
              <UBadge v-if="location.isPrimary" color="primary" variant="soft">Primary</UBadge><span v-else />
            </div>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Site locations | KrabiClaw Admin', robots: 'noindex, nofollow' })
const route = useRoute()
const toast = useToast()
const orgId = computed(() => String(route.params.orgId || ''))
const siteId = computed(() => String(route.params.siteId || ''))
interface Response { organization: { name: string }; site: { slug: string; brandName: string | null; pageViews30d: number; sessions30d: number }; locations: { id: string; slug: string; title: string; city: string | null; isPrimary: boolean; rating: number | null; reviewCount: number }[] }
const data = ref<Response | null>(null)
const loading = ref(true)
function formatNumber(value: number) { return new Intl.NumberFormat().format(value) }
onMounted(async () => {
  try {
    data.value = await applicationFetch<Response>(`/api/admin/portfolio/${orgId.value}/sites/${siteId.value}`, { validate: (value): value is Response => isRecord(value) && isRecord(value.organization) && isRecord(value.site) && Array.isArray(value.locations) })
  } catch { toast.add({ title: 'Failed to load site', color: 'error' }) }
  finally { loading.value = false }
})
</script>
