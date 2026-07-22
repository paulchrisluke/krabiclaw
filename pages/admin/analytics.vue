<template>
  <UDashboardPanel id="admin-analytics">
    <template #header>
      <UDashboardNavbar title="Analytics">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <div v-if="analyticsLoading" class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <USkeleton v-for="i in 6" :key="i" class="h-24 rounded-xl" />
        </div>
        <div v-else>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <UCard v-for="stat in analyticsStats" :key="stat.label">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">{{ stat.label }}</p>
              <p class="mt-1 text-2xl font-bold text-highlighted">{{ stat.value }}</p>
            </UCard>
          </div>

          <h3 class="text-sm font-semibold text-default mb-3">Recent sites</h3>
          <div class="divide-y divide-default rounded-xl border border-default overflow-hidden">
            <div v-if="!analytics?.recentSites?.length" class="px-5 py-4 text-sm text-muted">No sites yet.</div>
            <div
              v-for="site in analytics?.recentSites"
              :key="site.id"
              class="flex items-center justify-between px-5 py-3"
            >
              <div>
                <p class="font-medium text-default">{{ site.brand_name || site.subdomain }}</p>
                <p class="text-xs text-muted">{{ site.subdomain }}.krabiclaw.com</p>
              </div>
              <p class="text-xs text-muted">{{ formatDate(site.created_at) }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'admin' })
useSeoMeta({ title: 'Analytics | KrabiClaw Admin', robots: 'noindex, nofollow' })

const toast = useToast()

interface Analytics {
  metrics: { users: number; organizations: number; sites: number; posts: number; menus: number; locations: number }
  recentSites: { id: string; brand_name: string | null; subdomain: string | null; created_at: string }[]
}

const analytics = ref<Analytics | null>(null)
const analyticsLoading = ref(true)

const analyticsStats = computed(() => [
  { label: 'Users',         value: analytics.value?.metrics.users ?? '—' },
  { label: 'Organizations', value: analytics.value?.metrics.organizations ?? '—' },
  { label: 'Sites',         value: analytics.value?.metrics.sites ?? '—' },
  { label: 'Locations',     value: analytics.value?.metrics.locations ?? '—' },
  { label: 'Menus',         value: analytics.value?.metrics.menus ?? '—' },
  { label: 'Posts',         value: analytics.value?.metrics.posts ?? '—' },
])

async function loadAnalytics() {
  analyticsLoading.value = true
  try {
    analytics.value = await $fetch<Analytics>('/api/admin/analytics')
  } catch {
    toast.add({ title: 'Failed to load analytics', color: 'error' })
  } finally {
    analyticsLoading.value = false
  }
}

onMounted(loadAnalytics)
</script>
