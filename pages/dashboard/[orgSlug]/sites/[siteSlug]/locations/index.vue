<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-end gap-2">
    <UButton
      :to="`${locationsPath}/new`"
      icon="i-lucide-plus"
      color="neutral"
      variant="soft"
      square
      :aria-label="`Add a ${locationNoun}`"
    />
    </div>

  <!--
    The skeleton borrows the selector's own grid and card ratio, so the page
    does not jump when the locations arrive.
  -->
  <div v-if="pending" class="space-y-6">
    <div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-6">
      <USkeleton v-for="index in 2" :key="index" class="aspect-[20/19] rounded-2xl" />
    </div>
  </div>

  <div
    v-else-if="!locations.length"
    class="rounded-2xl border border-default bg-elevated px-6 py-20 text-center"
  >
    <div class="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">
      <UIcon name="i-lucide-map-pin" class="size-6 text-muted" />
    </div>
    <h2 class="mt-5 text-base font-semibold text-highlighted">No {{ locationsLabel.toLowerCase() }} yet</h2>
    <UButton
      :label="`Add your first ${locationNoun}`"
      icon="i-lucide-plus"
      class="mt-6"
      :to="`${locationsPath}/new`"
    />
  </div>

  <DashboardSiteLocationSelector
    v-else
    :items="selectorItems"
    missing-image-label="No hero photo"
    missing-image-hint="Add one under this location's photos."
  />
  </div>
</template>

<script setup lang="ts">
import DashboardSiteLocationSelector from '~/components/dashboard/SiteLocationSelector.vue'
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'

definePageMeta({ layout: 'dashboard' })

const dashboard = useDashboardSite()
const { sitePaths } = useDashboardSiteLinks()

const pending = dashboard.pending
const locations = computed(() => dashboard.locations.value)

const locationsPath = computed(() => {
  if (!sitePaths.value) throw createError({ statusCode: 400, statusMessage: 'Dashboard site scope is required' })
  return sitePaths.value.locations
})

// A professional services site calls these offices, not locations. The nav label
// already resolves this from capabilities; this page reads the same source so the
// two never disagree.
const capabilities = computed(() => {
  const rawVertical = dashboard.site.value?.vertical
  if (!rawVertical) throw createError({ statusCode: 500, statusMessage: 'Site vertical is not configured' })
  // Deliberately unguarded: swallowing this returned generic vocabulary for a
  // professional services site, and on the hub an empty feature set that hid
  // every content section. A misconfiguration must be visible, not quietly
  // rendered as a site with nothing in it.
  return resolveCmsCapabilities(
    normalizeVertical(rawVertical) as SiteVertical,
    resolvePublicTemplate({ themeId: dashboard.site.value?.theme_id, vertical: rawVertical }).slug,
    { site: parseCmsFeatureOverrideDelta(dashboard.site.value?.feature_overrides) },
  )
})
const usesServiceAreaVocabulary = computed(() => capabilities.value?.locationVocabulary === 'office/service area')
const locationsLabel = computed(() => (usesServiceAreaVocabulary.value ? 'Offices / Service Areas' : 'Locations'))
const locationNoun = computed(() => (usesServiceAreaVocabulary.value ? 'office' : 'location'))

/**
 * A location is identified by where it is, so the card carries its address and
 * no eyebrow. Where a site card reads "Restaurant · demo.krabiclaw.com", a
 * location card reads its street address under its name.
 *
 * The card reads `address` and only `address`. A location with none says so:
 * substituting the city would make this line mean two different things
 * depending on data the reader cannot see.
 *
 * The tile shows the location's own hero photograph, not its generated social
 * card. The card has the name, description and logo composed into the pixels
 * for a 1200x630 frame, so cropping it to the tile's near-square shape cut the
 * words off at both edges. The name belongs under the tile, in text.
 */
const selectorItems = computed(() => locations.value.map(location => ({
  id: location.id,
  label: location.title,
  imageUrl: heroUrl(location),
  eyebrow: '',
  summary: addressSummary(location),
  to: `${locationsPath.value}/${location.slug}`,
})))

function heroUrl(location: (typeof locations.value)[number]): string | null {
  const hero = location.media.find(item => item.slot === 'hero')
  if (!hero) return null
  // A video hero has no frame to show without playing it; its poster does.
  return hero.kind === 'video' ? hero.thumbnail_url : hero.public_url
}

function addressSummary(location: (typeof locations.value)[number]): string {
  const lines = location.address?.addressLines?.filter(line => line.trim()) ?? []
  return lines.length ? lines.join(', ') : 'Address not set'
}

useSeoMeta({ title: () => `${locationsLabel.value} | KrabiClaw Dashboard`, robots: 'noindex, nofollow' })
</script>
