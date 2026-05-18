<template>
  <SiteHeaderLinks :links="links" />
</template>

<script setup lang="ts">
import type { DashboardActionLink } from '~/composables/useDashboardSiteLinks'

defineProps<{
  links: DashboardActionLink[]
}>()
</script>
