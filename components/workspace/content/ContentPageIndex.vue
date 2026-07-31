<template>
  <div v-if="loadError">
    <UAlert color="error" variant="soft" title="Content unavailable" :description="loadError" />
  </div>

  <div v-else-if="!siteData" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <USkeleton v-for="i in 3" :key="i" class="h-32 rounded-xl" />
  </div>

  <div v-else-if="pages.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <UCard v-for="page in pages" :key="page.id">
      <UIcon name="i-lucide-file-text" class="size-5 text-primary" />
      <h2 class="mt-3 font-semibold text-highlighted">{{ page.label }}</h2>
      <UButton :to="`${basePath}/${page.id}`" label="Edit" class="mt-4" size="sm" />
    </UCard>
  </div>

  <UAlert v-else color="neutral" variant="soft" title="No editable pages" description="This template has no field-editable pages for this scope." />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { getScopedEditablePages } from '~/config/content-registry'
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities } from '~/config/cms-registry'
import type { PublicTemplateSlug } from '~/utils/template-registry'
import type { SiteVertical } from '~/utils/vertical-copy'

const props = defineProps<{
  siteId: string
  /** Which half of a template's page inventory to list — see the matching
   *  prop on CmsContentEditor.vue for why this is host-decided. */
  scope: 'site' | 'location'
}>()

const { paths } = useDashboardSiteLinks(props.siteId)
const basePath = computed(() => props.scope === 'location' ? `${paths.value.project}/content` : paths.value.content)

const siteData = ref<ApiRecord | null>(null)
const siteLocations = ref<Array<{ id: string; slug: string; title: string; is_primary: boolean; feature_overrides?: string | null }>>([])
const loadError = ref<string | null>(null)

// Only meaningful when scope === 'location' (this component is only ever rendered inside a
// locations/[locationSlug]/... route in that case) — route-derived, same pattern as
// layouts/dashboard.vue and the location settings page.
const dashboardLocation = useDashboardLocation()
const activeLocation = computed(() =>
  props.scope === 'location' ? siteLocations.value.find(l => l.id === dashboardLocation.currentLocationId.value) ?? null : null
)

const cmsCapabilities = computed(() => {
  if (!siteData.value) return null
  return resolveCmsCapabilities(siteData.value.vertical as SiteVertical, siteData.value.template as PublicTemplateSlug, {
    site: parseCmsFeatureOverrideDelta(siteData.value.feature_overrides as string | null | undefined),
    // Without this, a module the active location has explicitly disabled would still list as
    // editable here even though its dashboard route already 404s.
    location: activeLocation.value ? parseCmsFeatureOverrideDelta(activeLocation.value.feature_overrides) : undefined,
  })
})

const pages = computed(() => getScopedEditablePages(
  (siteData.value?.vertical as SiteVertical | undefined) ?? null,
  cmsCapabilities.value,
  props.scope,
))

onMounted(async () => {
  try {
    const response = await $fetch<{ context: ApiRecord }>(`/api/editor/sites/${props.siteId}/context`)
    siteData.value = response.context.site
    siteLocations.value = response.context.locations || []
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Failed to load content pages'
  }
})
</script>
