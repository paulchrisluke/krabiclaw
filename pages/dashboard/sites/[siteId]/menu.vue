<template>
  <div class="menu-dashboard">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-(--ui-text-highlighted)">Menu Management</h1>
      <p class="text-(--ui-text-muted) mt-1">{{ locationId ? 'Manage the menu for this location' : 'Manage brand-wide menus' }}</p>
    </div>

    <!-- Menu Editor -->
    <div>
      <MenuEditor :key="locationId || 'brand'" :site-id="siteId" :location-id="locationId" />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'dashboard'
})
import { useTenantSite } from '~/composables/useTenantSite'

const route = useRoute()
const siteId = route.params.siteId as string
const locationId = computed(() => typeof route.query.locationId === 'string' ? route.query.locationId : null)

// Verify user has access to this site
const tenant = await useTenantSite()
if (tenant.siteId !== siteId) {
  throw createError({
    statusCode: 403,
    statusMessage: 'Access denied'
  })
}

// SEO
useSeoMeta({
  title: 'Menu Management | Dashboard',
  description: 'Manage your restaurant menus'
})
</script>
