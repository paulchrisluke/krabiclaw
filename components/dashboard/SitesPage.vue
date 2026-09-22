<template>
  <DashboardIndexPanel id="locations" :title="locationsLabel">
    <template #right>
      <UButton
        v-if="businessPaths"
        :to="businessPaths.newLocation"
        icon="i-lucide-plus"
        color="neutral"
        variant="soft"
        square
        :aria-label="`Add a ${locationNoun}`"
      />
    </template>
    <UAlert v-if="locationsError" color="error" variant="soft" icon="i-lucide-triangle-alert" title="Could not load locations" :description="getErrorMessage(locationsError, 'Locations could not be loaded')" />
    <div v-else-if="!locations.length" class="rounded-2xl border border-default bg-elevated px-6 py-20 text-center">
      <UIcon name="i-lucide-map-pin" class="mx-auto size-6 text-muted" />
      <h2 class="mt-5 text-base font-semibold text-highlighted">No {{ locationsLabel.toLowerCase() }} yet</h2>
      <UButton
        v-if="businessPaths"
        :label="`Add your first ${locationNoun}`"
        icon="i-lucide-plus"
        class="mt-6"
        :to="businessPaths.newLocation"
      />
    </div>

    <DashboardSiteLocationSelector
      v-else
      :items="tiles"
      missing-image-label="No hero photo"
      missing-image-hint="Add one under this location's photos."
    />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import DashboardSiteLocationSelector, { type SiteLocationSelectorItem } from '~/components/dashboard/SiteLocationSelector.vue'
import { dashboardFetch } from '~/composables/dashboardFetch'
import type { DashboardLocation } from '~/composables/useDashboardSite'
import { getErrorMessage } from '~/utils/errors'
import { resolveCmsCapabilities } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'

const route = useRoute()
const dashboard = useDashboardSite()
const { businessPaths } = useDashboardSiteLinks()

const site = computed(() => dashboard.sites.value[0] ?? null)

// This tab stands outside any site route, so the context carries no
// locations; they are read for the whole organization.
const orgSlug = computed(() => String(route.params.orgSlug || ''))
const { data: locationsData, error: locationsError } = await useAsyncData(`dashboard-org-locations:${orgSlug.value}`, () =>
  dashboardFetch<{ success: true; locations: DashboardLocation[] }>('/api/dashboard/locations', { orgSlug: orgSlug.value }, {
    query: { organization: 'true' },
    validate: (value): value is { success: true; locations: DashboardLocation[] } =>
      isRecord(value) && value.success === true && Array.isArray(value.locations),
  }), { watch: [orgSlug] })
const locations = computed(() => locationsData.value?.locations ?? [])

// A professional services site calls these offices. The vocabulary comes from
// the same capabilities the rest of the dashboard reads; it depends on the
// vertical alone, so the site summary is enough.
const capabilities = computed(() => {
  const vertical = site.value?.vertical
  if (!vertical) return null
  return resolveCmsCapabilities(normalizeVertical(vertical) as SiteVertical, resolvePublicTemplate({ vertical }).slug, {})
})
const usesServiceAreaVocabulary = computed(() => capabilities.value?.locationVocabulary === 'office/service area')
const locationsLabel = computed(() => (usesServiceAreaVocabulary.value ? 'Offices / Service Areas' : 'Locations'))
const locationNoun = computed(() => (usesServiceAreaVocabulary.value ? 'office' : 'location'))

/**
 * A location is identified by where it is, so the tile carries its address
 * and its own hero photograph. The name belongs under the tile, in text.
 */
const tiles = computed<SiteLocationSelectorItem[]>(() => locations.value.map((location) => {
  const hero = location.media.find(item => item.slot === 'hero')
  const lines = location.address?.addressLines?.filter(line => line.trim()) ?? []
  return {
    id: location.id,
    label: location.title,
    imageUrl: hero ? (hero.kind === 'video' ? hero.thumbnail_url : hero.public_url) : null,
    eyebrow: '',
    summary: lines.length ? lines.join(', ') : 'Address not set',
    to: `/dashboard/${orgSlug.value}/sites/${location.parent_site_slug}/locations/${location.slug}`,
  }
}))

useSeoMeta({ title: () => `${locationsLabel.value} | KrabiClaw`, robots: 'noindex, nofollow' })
</script>
