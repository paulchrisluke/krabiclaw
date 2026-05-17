<template>
  <!-- This page only renders if the redirect below fails (e.g. no locations yet) -->
  <div class="min-h-screen bg-default text-default flex items-center justify-center">
    <div class="text-center px-4">
      <p class="saya-kicker mb-6">Menu</p>
      <h1 class="saya-display-sm text-default mb-4">Choose a location to view its menu.</h1>

      <p v-if="pending" class="text-sm text-muted mb-8">Loading locations...</p>
      <p v-else-if="error" class="text-sm text-error mb-8">We could not load locations right now. Please try again.</p>

      <div v-else-if="locations.length > 0" class="mb-8 space-y-2">
        <NuxtLink
          v-for="location in locations"
          :key="location.id"
          :to="location.slug ? `/locations/${location.slug}/menu` : '/locations'"
          class="block text-sm underline underline-offset-4"
        >
          {{ location.name || 'View menu location' }}
        </NuxtLink>
      </div>

      <UButton to="/locations" color="primary" variant="solid" class="rounded-full">
        View all locations
      </UButton>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })

const { siteId } = useTenantSite()
const { data, pending, error } = siteId
  ? useFetch(`/api/public/sites/${siteId}/locations`, {
      key: `menu-redirect-locs-${siteId}`,
      default: () => ({ locations: [] })
    })
  : {
      data: ref({ locations: [] }),
      pending: ref(false),
      error: ref(null)
    }

const locations = computed(() => data.value?.locations ?? [])

watch(error, value => {
  if (value) {
    console.error('Failed to fetch menu locations:', value)
  }
}, { immediate: true })

watch([pending, error, locations], async ([isPending, fetchError, locationList]) => {
  if (!siteId || isPending || fetchError) return

  // Primary location first, then first in list
  const target = locationList.find(l => l.is_primary) ?? locationList[0]
  if (target?.slug) {
    await navigateTo(`/locations/${target.slug}/menu`, { redirectCode: 302 })
  }
}, { immediate: true })
</script>
