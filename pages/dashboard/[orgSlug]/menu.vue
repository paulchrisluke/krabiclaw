<template>
  <OrganizationPlaceholderPage
    slug="menu"
    title="Menu"
    description="Organization-level tools and navigation are coming soon."
    icon="i-lucide-menu"
  />
</template>

<script setup lang="ts">
import OrganizationPlaceholderPage from '~/lib/components/workspace/dashboard/OrganizationPlaceholderPage.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Menu | KrabiClaw', robots: 'noindex, nofollow' })
</script>
