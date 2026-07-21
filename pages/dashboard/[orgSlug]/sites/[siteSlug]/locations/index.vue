<template>
  <UDashboardPanel id="site-locations">
    <template #header>
      <UDashboardNavbar title="Locations">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <UButton
            icon="i-lucide-plus"
            label="Add location"
            size="sm"
            color="primary"
            variant="soft"
            :to="`/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/new`"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="locations.length === 0" class="py-16 text-center">
        <UIcon name="i-lucide-map-pin" class="size-8 text-muted mx-auto mb-3" />
        <p class="text-sm text-muted">No locations yet.</p>
        <UButton
          label="Add your first location"
          size="sm"
          color="primary"
          class="mt-4"
          :to="`/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/new`"
        />
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <NuxtLink
          v-for="location in locations"
          :key="location.id"
          :to="`/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/${location.slug}`"
          class="group block"
        >
          <UCard variant="soft" class="h-full cursor-pointer">
            <div class="aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
              <img
                v-if="location.hero_url"
                :src="cfImageVariant(location.hero_url, { width: 640 }) ?? undefined"
                :alt="location.title"
                class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              <div v-else class="flex h-full items-center justify-center">
                <UIcon name="i-lucide-map-pin" class="size-8 text-muted" />
              </div>
            </div>
            <div class="p-4">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-highlighted truncate">{{ location.title }}</p>
                  <p class="text-xs text-muted">{{ location.city || location.addressText || 'Location' }}</p>
                </div>
                <UBadge
                  v-if="location.status"
                  :label="location.status"
                  color="neutral"
                  variant="soft"
                  size="xs"
                />
              </div>
            </div>
          </UCard>
        </NuxtLink>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Locations | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()

const locations = computed(() => dashboardLocation.locations.value)

function addressText(address: { addressLines?: string[] } | null) {
  return address?.addressLines?.filter(Boolean).join(', ') ?? ''
}
</script>
