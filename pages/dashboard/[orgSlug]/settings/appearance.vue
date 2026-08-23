<template>
  <OrganizationAppearanceSettingsPage />
</template>

<script setup lang="ts">
import OrganizationAppearanceSettingsPage from '~/lib/components/workspace/settings/OrganizationAppearanceSettingsPage.vue'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Appearance | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
