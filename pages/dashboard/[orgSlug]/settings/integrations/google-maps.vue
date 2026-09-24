<template>
  <!--
    Google Maps is per location: each KrabiClaw location is matched to at most
    one Google Maps place, so this is a list of locations, each a leaf.
  -->
  <DashboardIndexPanel id="integration-google-maps" title="Google Maps">
    <USkeleton v-if="!integrations.summary.value" class="h-32 rounded-xl" />
    <p v-else-if="!items.length" class="text-sm text-muted">Add a location first, then connect it to its Google Maps place.</p>
    <EditorNavigationList v-else :groups="[{ id: 'locations', items }]" :active-item="level.child.value" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationItem } from '~/components/dashboard/EditorNavigationList.vue'
import { integrationsKey } from '../integrations.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const level = useRouteLevel()
const integrations = inject(integrationsKey)!

const items = computed<EditorNavigationItem[]>(() => (integrations.summary.value?.google_maps ?? []).map(location => ({
  id: location.slug,
  label: location.title,
  summary: location.google_place_id ? 'Connected' : 'Not connected',
  icon: 'i-lucide-map-pin',
  to: `/dashboard/${String(route.params.orgSlug)}/settings/integrations/google-maps/${location.slug}`,
})))
</script>
