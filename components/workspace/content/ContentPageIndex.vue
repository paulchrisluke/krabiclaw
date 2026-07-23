<template>
  <div v-if="loadError">
    <UAlert color="error" variant="soft" title="Content unavailable" :description="loadError" />
  </div>

  <div v-else-if="!siteData" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <USkeleton v-for="i in 3" :key="i" class="h-32 rounded-xl" />
  </div>

  <div v-else-if="cmsCapabilities?.template === 'blawby'" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <UCard v-for="manager in cmsManagers" :key="manager.id">
      <UIcon :name="manager.icon" class="size-5 text-primary" />
      <h2 class="mt-3 font-semibold text-highlighted">{{ manager.label }}</h2>
      <UButton :to="manager.to" :disabled="!manager.to" label="Open editor" class="mt-4" size="sm" />
    </UCard>
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
import { parseCmsFeatureOverride, resolveCmsCapabilities } from '~/config/cms-registry'
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
const siteLocations = ref<Array<{ id: string; slug: string; title: string; is_primary: boolean }>>([])
const loadError = ref<string | null>(null)

const cmsCapabilities = computed(() => {
  if (!siteData.value) return null
  return resolveCmsCapabilities(siteData.value.vertical as SiteVertical, siteData.value.template as PublicTemplateSlug, {
    site: parseCmsFeatureOverride(siteData.value.enabled_features as string | null | undefined),
  })
})

// blawby has no field-editable pages yet (professional_services editor gap,
// issue #323) — fall back to its manager grid instead of an empty page list.
const cmsManagers = computed(() => {
  const capabilities = cmsCapabilities.value
  if (!capabilities) return []
  const location = siteLocations.value.find(l => l.is_primary)?.slug ?? siteLocations.value[0]?.slug
  const iconBySection = {
    collections: 'i-lucide-database',
    locations: 'i-lucide-map-pin',
    media: 'i-lucide-image',
    site: 'i-lucide-settings',
  } as const
  return capabilities.managers.map((manager) => {
    if (manager.id === 'settings') {
      return { ...manager, icon: iconBySection[manager.section], to: paths.value.settingsGeneral }
    }
    if (manager.scope === 'location' && !location) {
      return { ...manager, icon: iconBySection[manager.section], to: undefined }
    }
    if (manager.scope === 'location') {
      const rel = manager.route ? manager.route.replace(/^:location\/?/, '') : ''
      const to = rel ? `${paths.value.site}/locations/${location}/${rel}` : `${paths.value.site}/locations/${location}`
      return { ...manager, icon: iconBySection[manager.section], to }
    }
    return {
      ...manager,
      icon: iconBySection[manager.section],
      to: manager.route ? `${paths.value.site}/${manager.route}` : paths.value.site,
    }
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
