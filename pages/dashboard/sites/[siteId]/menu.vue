<template>
  <div class="menu-dashboard">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Menu Management</h1>
      <p class="text-gray-600 mt-1">Manage menus for your site locations</p>
    </div>

    <!-- Editor Toolbar with scope switcher -->
    <EditorToolbar :site-id="siteId" />

    <!-- Menu Editor -->
    <div class="mt-6">
      <MenuEditor :site-id="siteId" />
    </div>
  </div>
</template>

<script setup>
definePageMeta({
  layout: 'dashboard'
})
import { useTenantSite } from '~/composables/useTenantSite'

const route = useRoute()
const siteId = route.params.siteId

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
