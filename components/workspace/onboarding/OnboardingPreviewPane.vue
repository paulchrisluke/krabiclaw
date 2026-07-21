<template>
  <div class="flex min-h-0 flex-col bg-elevated">
    <!-- Preview toolbar -->
    <div class="flex shrink-0 items-center gap-2.5 border-b border-default bg-default px-[18px] py-3">
      <!-- Page tabs -->
      <div class="flex gap-0.5 rounded-[11px] border border-default bg-muted p-1">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :disabled="!tab.enabled"
          :class="[
            'rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors',
            selectedPage === tab.id
              ? 'bg-default text-highlighted shadow-sm'
              : 'bg-transparent text-muted hover:text-highlighted',
            !tab.enabled && 'cursor-not-allowed opacity-35',
          ]"
          @click="tab.enabled && $emit('select-page', tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Location switcher (only for location-scoped pages) -->
      <button
        v-if="currentTabIsLocationScoped && siteLocations.length > 0"
        class="inline-flex items-center gap-1.5 rounded-[10px] border border-default bg-default px-3 py-2 text-[12.5px] font-semibold text-highlighted shadow-sm transition-colors hover:border-default/80"
        @click="cycleLocation"
      >
        <UIcon name="i-lucide-map-pin" class="size-3.5 text-primary" />
        {{ selectedLocationLabel }}
      </button>

      <!-- Status badge (pushed right) -->
      <div class="ml-auto flex items-center gap-2">
        <UBadge
          v-if="siteStatus === 'live'"
          color="success"
          variant="soft"
          size="sm"
          class="gap-1.5"
        >
          <span class="size-1.5 rounded-full bg-current" />
          Live
        </UBadge>
        <UBadge
          v-else-if="siteStatus === 'ready'"
          color="primary"
          variant="soft"
          size="sm"
          class="gap-1.5"
        >
          <span class="size-1.5 rounded-full bg-current" />
          Ready to launch
        </UBadge>
        <UBadge
          v-else-if="iframeSrc"
          color="warning"
          variant="soft"
          size="sm"
          class="gap-1.5"
        >
          <span class="size-1.5 rounded-full bg-current" />
          Building
        </UBadge>

        <!-- Open in new tab -->
        <UButton
          v-if="iframeSrc"
          :href="iframeSrc"
          target="_blank"
          rel="noopener noreferrer"
          icon="i-lucide-external-link"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Open preview"
        />
      </div>
    </div>

    <!-- Empty state (no site yet) -->
    <div v-if="!iframeSrc" class="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center text-muted">
      <div class="flex size-[60px] items-center justify-center rounded-2xl border border-default bg-default text-dimmed">
        <UIcon name="i-lucide-globe" class="size-7" />
      </div>
      <p class="text-[15px] font-semibold text-highlighted">Your site shows up here.</p>
      <p class="max-w-[30ch] text-[12.5px] leading-relaxed">
        Tell me where to start and I'll build your homepage live as we chat.
      </p>
    </div>

    <!-- Preview scroll area -->
    <div v-else class="min-h-0 flex-1 overflow-auto p-5">
      <SitePreviewFrame :iframe-src="iframeSrc" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { getEditablePages } from '~/config/content-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import type { SiteVertical } from '~/utils/vertical-copy'

const props = withDefaults(defineProps<{
  iframeSrc: string
  siteLocations: Array<{ id: string; slug: string; title: string; is_primary: boolean }>
  selectedLocationId: string | null
  selectedPage: string
  siteStatus: 'setup' | 'progress' | 'ready' | 'live'
  siteDomain?: string
  vertical?: SiteVertical
}>(), {
  vertical: 'restaurant',
})

const emit = defineEmits<{
  'select-page': [page: string]
  'select-location': [id: string]
}>()

// Derives the "core offering" tab (Menu / Experiences / Services) from the
// same page registry the main CMS editor uses, instead of a hardcoded
// Saya-shaped "Menu" tab. professional_service has no menu/experiences
// registry entry (see #276/#277), so it falls through to the resolved
// public template's offerings route (/services for Blawby) — site-level,
// not location-scoped, per #285.
const secondaryTab = computed(() => {
  if (props.vertical === 'professional_service') {
    const offeringsPath = resolvePublicTemplate({ vertical: props.vertical }).serviceRoutes.offeringsIndex
    if (!offeringsPath) return null
    return { id: offeringsPath.replace(/^\//, ''), label: 'Services', enabled: !!props.iframeSrc, locationScoped: false }
  }
  const template = resolvePublicTemplate({ vertical: props.vertical })
  const match = getEditablePages(props.vertical, template.slug).find(page => page.id === 'menu' || page.id === 'experiences')
  if (!match) return null
  return { id: match.id, label: match.label, enabled: !!props.iframeSrc, locationScoped: match.scope === 'location' }
})

const tabs = computed(() => {
  const list = [{ id: 'home', label: 'Home', enabled: !!props.iframeSrc, locationScoped: false }]
  if (secondaryTab.value) list.push(secondaryTab.value)
  list.push({ id: 'about', label: 'About', enabled: !!props.iframeSrc, locationScoped: false })
  list.push({ id: 'contact', label: 'Contact', enabled: !!props.iframeSrc, locationScoped: false })
  return list
})

const currentTabIsLocationScoped = computed(() => tabs.value.find(tab => tab.id === props.selectedPage)?.locationScoped === true)

const selectedLocation = computed(() =>
  props.siteLocations.find(l => l.id === props.selectedLocationId) ?? props.siteLocations[0] ?? null
)
const selectedLocationLabel = computed(() => selectedLocation.value?.title ?? 'All locations')

const cycleLocation = () => {
  if (!props.siteLocations.length) return
  const idx = props.siteLocations.findIndex(l => l.id === props.selectedLocationId)
  const next = props.siteLocations[(idx + 1) % props.siteLocations.length]
  if (next) emit('select-location', next.id)
}
</script>
