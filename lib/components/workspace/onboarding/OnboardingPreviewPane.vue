<template>
  <div class="flex size-full min-h-0 flex-col bg-elevated">
    <div
      v-if="!homeOnly"
      class="flex shrink-0 items-center gap-2.5 border-b border-default bg-default px-[18px] py-3"
    >
      <div class="flex gap-0.5 rounded-[11px] border border-default bg-muted p-1">
        <UButton
          v-for="tab in tabs"
          :key="tab.id"
          size="sm"
          color="neutral"
          :variant="selectedPage === tab.id ? 'soft' : 'ghost'"
          :aria-current="selectedPage === tab.id ? 'page' : undefined"
          :disabled="!tab.enabled"
          @click="tab.enabled && $emit('select-page', tab.id)"
        >
          {{ tab.label }}
        </UButton>
      </div>

      <UButton
        v-if="currentTabIsLocationScoped && siteLocations.length > 0"
        color="neutral"
        variant="outline"
        icon="i-lucide-map-pin"
        @click="cycleLocation"
      >
        {{ selectedLocationLabel }}
      </UButton>

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
          color="primary"
          variant="soft"
          size="sm"
          class="gap-1.5"
        >
          <span class="size-1.5 rounded-full bg-current" />
          Draft
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

    <Transition name="onboarding-preview" mode="out-in">
      <iframe
        v-if="iframeSrc"
        :data-preview-frame-id="previewFrameId"
        key="iframe"
        :src="iframeSrc"
        title="Site preview"
        sandbox="allow-same-origin allow-scripts allow-forms"
        class="size-full min-h-0 flex-1 border-0 bg-default"
      />
      <div v-else-if="emptyVisualUrl" :key="emptyVisualUrl" class="relative min-h-0 flex-1 overflow-hidden bg-default">
        <div class="flex h-full w-full items-center justify-center bg-muted p-4 sm:p-6 lg:p-8">
          <div class="relative w-full max-w-4xl">
            <div
              class="absolute inset-0 rounded-3xl opacity-25 blur-2xl"
              style="background: linear-gradient(135deg, var(--kc-coral-200), var(--kc-teal-100));"
            />
            <div
              class="relative overflow-hidden rounded-3xl border border-default/60 p-3 shadow-2xl sm:p-5"
              style="background: linear-gradient(145deg, var(--kc-coral-50) 0%, #fff8f6 100%);"
            >
              <img
                :src="emptyVisualUrl"
                :alt="emptyVisualAlt"
                class="block max-h-[calc(100vh-8rem)] w-full rounded-[20px] object-contain shadow-lg"
              >
            </div>
          </div>
        </div>
      </div>
      <div v-else key="empty" class="min-h-0 flex-1 bg-default" />
    </Transition>
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
  homeOnly?: boolean
  emptyVisualUrl?: string
  emptyVisualAlt?: string
}>(), {
  vertical: 'restaurant',
  homeOnly: false,
  emptyVisualUrl: '',
  emptyVisualAlt: '',
})

const emit = defineEmits<{
  'select-page': [page: string]
  'select-location': [id: string]
}>()
const previewFrameId = useId()

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

<style scoped>
.onboarding-preview-enter-active,
.onboarding-preview-leave-active {
  transition: opacity 180ms ease;
}

.onboarding-preview-enter-from {
  opacity: 0;
}

.onboarding-preview-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .onboarding-preview-enter-active,
  .onboarding-preview-leave-active {
    transition: opacity 80ms linear;
  }

}
</style>
