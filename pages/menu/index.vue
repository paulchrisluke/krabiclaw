<template>
  <!-- This page only renders if the redirect below fails (e.g. no locations yet) -->
  <div class="min-h-screen bg-default text-default flex items-center justify-center">
    <div class="text-center px-4">
      <p class="saya-kicker mb-6">Menu</p>
      <h1 class="saya-display-sm text-default mb-8">Choose a location to view its menu.</h1>
      <UButton to="/locations" color="neutral" variant="solid" class="rounded-full">
        View all locations
      </UButton>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'saya' })

const { siteId } = useTenantSite()

if (siteId) {
  const { data } = await useFetch(`/api/public/sites/${siteId}/locations`, {
    key: `menu-redirect-locs-${siteId}`,
    default: () => ({ locations: [] })
  })

  const locations = data.value?.locations ?? []

  // Primary location first, then first in list
  const target = locations.find(l => l.is_primary) ?? locations[0]

  if (target?.slug) {
    await navigateTo(`/locations/${target.slug}/menu`, { redirectCode: 302 })
  } else if (locations.length === 0) {
    // No locations yet — fall through to the template above
  }
}
</script>
