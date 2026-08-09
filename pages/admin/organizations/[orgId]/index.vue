<template>
  <UDashboardPanel id="admin-organization-sites">
    <template #header>
      <UDashboardNavbar :title="data?.organization.name || 'Organization'">
        <template #leading><DashboardSidebarCollapseButton /></template>
        <template #trailing><UButton to="/admin" color="neutral" variant="ghost" size="xs" icon="i-lucide-arrow-left">Organizations</UButton></template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="space-y-6">
        <div v-if="loading" class="space-y-3"><USkeleton v-for="i in 4" :key="i" class="h-20 rounded-xl" /></div>
        <template v-else-if="data">
          <div>
            <p class="text-sm text-muted">{{ data.organization.slug || data.organization.id }}</p>
            <h2 class="mt-1 text-xl font-semibold text-highlighted">Sites</h2>
          </div>
          <UCard v-if="data.sites.length === 0"><p class="text-sm text-muted">This organization has no sites.</p></UCard>
          <div v-else class="grid gap-4 lg:grid-cols-2">
            <NuxtLink v-for="site in data.sites" :key="site.id" :to="`/admin/organizations/${orgId}/sites/${site.id}`" class="rounded-xl border border-default bg-default p-5 transition-colors hover:bg-elevated/50">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-semibold text-highlighted">{{ site.brandName || site.slug }}</p>
                  <p class="text-xs text-muted">{{ site.customDomain || (site.subdomain ? `${site.subdomain}.krabiclaw.com` : site.slug) }}</p>
                </div>
                <UBadge color="neutral" variant="soft">{{ site.plan || 'free' }}</UBadge>
              </div>
              <div class="mt-5 grid grid-cols-3 gap-3 text-sm">
                <div><p class="text-xs text-muted">Locations</p><p class="font-semibold">{{ site.locationCount }}</p></div>
                <div><p class="text-xs text-muted">30d views</p><p class="font-semibold">{{ formatNumber(site.pageViews30d) }}</p></div>
                <div><p class="text-xs text-muted">Sessions</p><p class="font-semibold">{{ formatNumber(site.sessions30d) }}</p></div>
              </div>
            </NuxtLink>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Organization sites | KrabiClaw Admin', robots: 'noindex, nofollow' })
const route = useRoute()
const toast = useToast()
const orgId = computed(() => String(route.params.orgId || ''))
interface Site { id: string; slug: string; brandName: string | null; subdomain: string | null; customDomain: string | null; plan: string | null; locationCount: number; pageViews30d: number; sessions30d: number }
interface Response { organization: { id: string; name: string; slug: string | null }; sites: Site[] }
const data = ref<Response | null>(null)
const loading = ref(true)
function formatNumber(value: number) { return new Intl.NumberFormat().format(value) }
onMounted(async () => {
  try {
    data.value = await applicationFetch<Response>(`/api/admin/portfolio/${orgId.value}`, { validate: (value): value is Response => isRecord(value) && isRecord(value.organization) && Array.isArray(value.sites) })
  } catch { toast.add({ title: 'Failed to load organization', color: 'error' }) }
  finally { loading.value = false }
})
</script>
