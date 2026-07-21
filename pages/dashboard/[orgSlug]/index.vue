<template>
  <UDashboardPanel id="org-overview">
    <template #header>
      <UDashboardNavbar title="Dashboard">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-plus" label="Add site" size="sm" color="primary" variant="soft" :to="`/dashboard/${orgSlug}/sites/new`" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="pending" class="space-y-4">
        <USkeleton v-for="i in 3" :key="i" class="h-24 rounded-xl" />
      </div>

      <div v-else class="space-y-6">
        <div v-if="sitesWithSubdomain.length === 0" class="py-16 text-center">
          <UIcon name="i-lucide-globe" class="size-8 text-muted mx-auto mb-3" />
          <p class="text-sm text-muted">No sites available.</p>
          <UButton label="Add your first site" size="sm" color="primary" class="mt-4" :to="`/dashboard/${orgSlug}/sites/new`" />
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NuxtLink
            v-for="s in sitesWithSubdomain"
            :key="s.id"
            :to="`/dashboard/${orgSlug}/sites/${s.subdomain}`"
            class="group block"
          >
            <UCard variant="soft" class="h-full cursor-pointer">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-highlighted truncate">{{ s.brand_name ?? s.subdomain }}</p>
                  <p class="text-xs text-muted">{{ s.subdomain }}.krabiclaw.com</p>
                </div>
                <UBadge :label="s.plan ?? 'free'" color="neutral" variant="soft" size="xs" />
              </div>
            </UCard>
          </NuxtLink>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Dashboard | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const orgSlug = route.params.orgSlug as string
const dashboard = useDashboardSite()
const pending = ref(true)

const sites = computed(() => dashboard.sites.value)
const sitesWithSubdomain = computed(() => sites.value.filter((site): site is (typeof sites.value)[number] & { subdomain: string } => Boolean(site.subdomain)))

onMounted(async () => {
  try {
    await dashboard.refresh()
  } finally {
    pending.value = false
  }
})
</script>
