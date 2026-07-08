<template>
  <AppSection padding="xl">
    <div class="mb-16 max-w-2xl">
      <p class="saya-kicker mb-6">{{ findUsKicker }}</p>
      <h2 class="saya-display-md text-default">
        {{ heading }}
      </h2>
    </div>
    <!-- Real locations -->
    <div v-if="locations.length > 0" :class="['grid gap-8', locations.length > 1 ? 'md:grid-cols-2' : '']">
      <NuxtLink
        v-for="(loc, locIdx) in locations"
        :key="loc.id"
        :ref="(el: Element | { $el?: Element } | null) => { const node = el && ('$el' in el ? el.$el : el); if (node) locCardRefs[locIdx] = node as HTMLElement; else locCardRefs[locIdx] = null; }"
        :to="`/locations/${loc.slug}`"
        class="group block overflow-hidden border border-default text-default no-underline transition hover:border-muted"
      >
        <div class="aspect-video overflow-hidden bg-muted">
          <!-- Poster image: always present for LCP. Video swaps in when card scrolls into view. -->
          <template v-if="loc.kind === 'video' && loc.public_url">
            <ClientOnly v-if="visibleLocCards.has(locIdx)">
              <video
                :src="loc.public_url"
                :poster="loc.thumbnail_url || undefined"
                autoplay muted loop playsinline preload="none"
                class="aspect-video w-full object-contain"
              />
            </ClientOnly>
            <UImage
              v-else-if="loc.thumbnail_url"
              :src="loc.thumbnail_url"
              :alt="loc.title"
              :loading="locIdx === 0 ? 'eager' : 'lazy'"
              :fetchpriority="locIdx === 0 ? 'high' : undefined"
              class="aspect-video w-full object-contain transition-transform duration-500 group-hover:scale-105"
            />
          </template>
          <UImage
            v-else-if="loc.public_url"
            :src="loc.public_url"
            :alt="loc.title"
            :loading="locIdx === 0 ? 'eager' : 'lazy'"
            :fetchpriority="locIdx === 0 ? 'high' : undefined"
            class="aspect-video w-full object-contain transition-transform duration-500 group-hover:scale-105"
          />
          <div v-else class="flex h-full w-full items-center justify-center" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="size-10 text-muted" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><g><path d="M15 10.5a3 3 0 1 1-6 0a3 3 0 0 1 6 0"/><path d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0"/></g></svg>
          </div>
        </div>
        <div class="p-8 pb-9">
          <div v-if="loc.city" class="saya-eyebrow mb-5 flex items-center gap-2 text-muted">
            <span class="size-1.5 rounded-full bg-zinc-300" />
            {{ loc.city }}
          </div>
          <div class="saya-display saya-italic text-4xl text-default leading-none">{{ loc.title }}</div>
          <div class="mt-6 border-t border-default pt-5">
            <span class="saya-eyebrow text-muted">{{ visitLocationCta }}</span>
          </div>
        </div>
      </NuxtLink>
    </div>
    <!-- Empty state: no locations yet -->
    <div v-else>
      <div class="grid gap-8 md:grid-cols-2">
        <SayaEmptyExample
          v-for="(example, i) in sayaEmptyStates.locations.examples"
          :key="i"
          :item="example"
          icon="map-pin"
          aspect="video"
          dashed
        />
      </div>
      <div class="text-center pt-8">
        <SayaMcpHint :hint="sayaEmptyStates.locations.hint" />
        <div v-if="isAuthenticated" class="mt-2">
          <NuxtLink to="/dashboard" class="inline-flex items-center justify-center rounded-full border border-default px-3 py-1.5 text-sm font-medium text-default no-underline transition hover:bg-muted">
            {{ connectGoogleCta }}
          </NuxtLink>
        </div>
      </div>
    </div>
  </AppSection>
</template>

<script setup lang="ts">
import AppSection from '~/components/ui/AppSection.vue'
import SayaEmptyExample from '~/components/saya/SayaEmptyExample.vue'
import SayaMcpHint from '~/components/saya/SayaMcpHint.vue'
import { sayaEmptyStates } from '~/config/saya-empty-states'

interface Props {
  data?: {
    locations?: Array<{
      id: string
      slug: string
      title: string
      city?: string
      public_url?: string
      thumbnail_url?: string
      kind?: string
    }>
    heading?: string
    isAuthenticated?: boolean
    findUsKicker?: string
    visitLocationCta?: string
    connectGoogleCta?: string
  }
}

const props = withDefaults(defineProps<Props>(), {
  data: () => ({})
})

const locations = computed(() => props.data?.locations || [])
const heading = computed(() => props.data?.heading || 'Our Locations')

// Load location card videos via IntersectionObserver when they scroll into
// view instead of eagerly — the poster/thumbnail image is always in SSR HTML.
const locCardRefs: (HTMLElement | null)[] = []
const visibleLocCards = ref(new Set<number>())
onMounted(() => {
  if (!('IntersectionObserver' in window)) return
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      const i = locCardRefs.indexOf(entry.target as HTMLElement)
      if (i >= 0) { visibleLocCards.value = new Set([...visibleLocCards.value, i]); obs.unobserve(entry.target) }
    })
  }, { rootMargin: '200px' })
  watch(() => locations.value.length, () => { nextTick(() => locCardRefs.forEach((el) => el && obs.observe(el))) }, { immediate: true })
  onUnmounted(() => obs.disconnect())
})
const isAuthenticated = computed(() => props.data?.isAuthenticated || false)
const findUsKicker = computed(() => props.data?.findUsKicker || 'Find us')
const visitLocationCta = computed(() => props.data?.visitLocationCta || 'Visit this location →')
const connectGoogleCta = computed(() => props.data?.connectGoogleCta || 'Connect Google Business →')
</script>
