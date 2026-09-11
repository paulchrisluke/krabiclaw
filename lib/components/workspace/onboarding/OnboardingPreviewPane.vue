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

      <USelect
        v-if="currentTabIsLocationScoped && siteLocations.length > 0"
        :model-value="selectedLocationId ?? undefined"
        :items="siteLocations.map(location => ({ label: location.title, value: location.id }))"
        placeholder="Select a location"
        aria-label="Preview location"
        @update:model-value="$emit('select-location', $event)"
      />

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
      <div v-else-if="currentTabIsLocationScoped && !selectedLocationId" class="flex flex-1 items-center justify-center p-6 text-muted">
        Select a location to preview this page.
      </div>
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
  siteLocations: Array<{ id: string; slug: string; title: string }>
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

defineEmits<{
  'select-page': [page: string]
  'select-location': [id: string]
}>()
const previewFrameId = useId()

const secondaryTab = computed(() => {
  if (props.vertical === 'service') {
    const offeringsPath = resolvePublicTemplate({ vertical: props.vertical }).serviceRoutes.offeringsIndex
    if (!offeringsPath) return null
    return { id: offeringsPath.replace(/^\//, ''), label: 'Services', enabled: !!props.iframeSrc || props.siteLocations.length > 0, locationScoped: false }
  }
  const template = resolvePublicTemplate({ vertical: props.vertical })
  const match = getEditablePages(props.vertical, template.slug).find(page => page.id === 'menu' || page.id === 'products')
  if (!match) return null
  const locationScoped = match.scope === 'location'
  const enabled = locationScoped ? props.siteLocations.length > 0 : !!props.iframeSrc || props.siteLocations.length > 0
  return { id: match.id, label: match.label, enabled, locationScoped }
})

const tabs = computed(() => {
  const list = [{ id: 'home', label: 'Home', enabled: !!props.iframeSrc || props.siteLocations.length > 0, locationScoped: false }]
  if (props.homeOnly) return list
  if (secondaryTab.value) list.push(secondaryTab.value)
  list.push({ id: 'about', label: 'About', enabled: !!props.iframeSrc || props.siteLocations.length > 0, locationScoped: false })
  list.push({ id: 'contact', label: 'Contact', enabled: !!props.iframeSrc || props.siteLocations.length > 0, locationScoped: false })
  return list
})

const currentTabIsLocationScoped = computed(() => tabs.value.find(tab => tab.id === props.selectedPage)?.locationScoped === true)

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
