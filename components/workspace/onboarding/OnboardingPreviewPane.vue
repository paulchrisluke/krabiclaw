<template>
  <div class="flex min-h-0 flex-col bg-elevated">
    <div
      v-if="!homeOnly"
      class="flex shrink-0 items-center gap-2.5 border-b border-default bg-default px-[18px] py-3"
    >
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

      <button
        v-if="currentTabIsLocationScoped && siteLocations.length > 0"
        class="inline-flex items-center gap-1.5 rounded-[10px] border border-default bg-default px-3 py-2 text-[12.5px] font-semibold text-highlighted shadow-sm transition-colors hover:border-default/80"
        @click="cycleLocation"
      >
        <UIcon name="i-lucide-map-pin" class="size-3.5 text-primary" />
        {{ selectedLocationLabel }}
      </button>

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

    <div v-if="!iframeSrc && placeholderState === 'building'" class="flex flex-1 items-center justify-center p-5">
      <div class="w-full max-w-[420px] overflow-hidden rounded-2xl border border-default bg-default shadow-sm">
        <div class="relative flex min-h-48 flex-col justify-end overflow-hidden bg-inverted p-5 text-inverted">
          <div class="absolute inset-0 opacity-20">
            <div class="absolute left-6 top-6 h-4 w-32 rounded-full bg-white/70" />
            <div class="absolute left-6 top-14 h-3 w-48 rounded-full bg-white/35" />
            <div class="absolute right-5 top-5 size-16 rounded-2xl bg-white/20" />
          </div>
          <div class="relative space-y-3">
            <div class="h-3 w-24 animate-pulse rounded-full bg-white/35" />
            <div class="h-7 w-4/5 animate-pulse rounded-full bg-white/75" />
            <div class="h-7 w-2/3 animate-pulse rounded-full bg-white/55" />
          </div>
        </div>
        <div class="space-y-4 p-5">
          <div>
            <p class="text-sm font-semibold text-highlighted">{{ skeletonTitle }}</p>
            <p class="mt-1 text-xs leading-relaxed text-muted">{{ skeletonDescription }}</p>
          </div>
          <div class="grid gap-2">
            <div class="h-11 animate-pulse rounded-xl bg-muted" />
            <div class="h-11 animate-pulse rounded-xl bg-muted" />
            <div class="h-24 animate-pulse rounded-xl bg-muted" />
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="!iframeSrc" class="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center text-muted">
      <img
        src="/krabiclaw-login-mascot.png"
        alt=""
        class="size-32 rounded-[28px] object-contain"
      >
      <div>
        <p class="text-[15px] font-semibold text-highlighted">Let's give your business a proper home.</p>
        <p class="mt-2 max-w-[30ch] text-[12.5px] leading-relaxed">
          Pick the kind of site you need and the homepage will start taking shape here.
        </p>
      </div>
    </div>

    <div v-else class="min-h-0 flex-1 overflow-auto p-5">
      <SitePreviewFrame :iframe-src="iframeSrc" :display-url="displayUrl" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { buildDisplayUrl, getEditablePages, resolvePreviewPath } from '~/config/content-registry'
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
  homeOnly?: boolean
  placeholderState?: 'empty' | 'building'
}>(), {
  vertical: 'restaurant',
  homeOnly: false,
  placeholderState: 'empty',
})

const emit = defineEmits<{
  'select-page': [page: string]
  'select-location': [id: string]
}>()

const secondaryTab = computed(() => {
  if (props.vertical === 'professional_service') {
    const offeringsPath = resolvePublicTemplate({ vertical: props.vertical }).serviceRoutes.offeringsIndex
    if (!offeringsPath) return null
    return { id: offeringsPath.replace(/^\//, ''), label: 'Services', enabled: !!props.iframeSrc, locationScoped: false }
  }
  const template = resolvePublicTemplate({ vertical: props.vertical })
  const match = getEditablePages(props.vertical, template.slug).find(page => page.id === 'menu' || page.id === 'experiences')
  if (!match) return null
  const locationScoped = match.scope === 'location'
  const enabled = !!props.iframeSrc && (!locationScoped || props.siteLocations.length > 0)
  return { id: match.id, label: match.label, enabled, locationScoped }
})

const tabs = computed(() => {
  const list = [{ id: 'home', label: 'Home', enabled: !!props.iframeSrc, locationScoped: false }]
  if (props.homeOnly) return list
  if (secondaryTab.value) list.push(secondaryTab.value)
  list.push({ id: 'about', label: 'About', enabled: !!props.iframeSrc, locationScoped: false })
  list.push({ id: 'contact', label: 'Contact', enabled: !!props.iframeSrc, locationScoped: false })
  return list
})

const currentTabIsLocationScoped = computed(() => tabs.value.find(tab => tab.id === props.selectedPage)?.locationScoped === true)
const verticalLabel = computed(() => {
  if (props.vertical === 'professional_service') return 'professional services'
  if (props.vertical === 'experience') return 'experience'
  return 'restaurant'
})
const skeletonTitle = computed(() => `Sketching the ${verticalLabel.value} homepage`)
const skeletonDescription = computed(() => 'I will fill this in with real business details as soon as the draft is ready.')

const displayUrl = computed(() => {
  const template = resolvePublicTemplate({ vertical: props.vertical })
  if (props.vertical === 'professional_service' && props.selectedPage === secondaryTab.value?.id) {
    return buildDisplayUrl(props.siteDomain ?? '', template.serviceRoutes.offeringsIndex ?? '/')
  }
  const page = getEditablePages(props.vertical, template.slug).find(p => p.id === props.selectedPage)
  const path = page?.scope === 'location' && selectedLocation.value
    ? resolvePreviewPath(props.selectedPage, { locationSlug: selectedLocation.value.slug })
    : page?.path ?? '/'
  return buildDisplayUrl(props.siteDomain ?? '', path)
})

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
