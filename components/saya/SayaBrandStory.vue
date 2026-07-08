<template>
  <AppSection bg="black" padding="xl">

      <!-- Filled state -->
      <template v-if="headline || body">
        <div :class="image ? 'grid gap-16 lg:grid-cols-2 lg:items-center' : ''">
          <div v-if="image" class="overflow-hidden">
            <img
              :src="image"
              alt=""
              aria-hidden="true"
              class="h-full w-full object-cover aspect-4/3"
            />
          </div>
          <div>
            <p class="saya-eyebrow mb-8 text-inverted/60">{{ ourStoryKicker }}</p>
            <h2 class="saya-display-md text-inverted" :class="image ? '' : 'max-w-3xl'">
              {{ headline }}
            </h2>
            <p class="mt-8 text-base leading-relaxed text-inverted/60" :class="image ? '' : 'max-w-2xl'">
              {{ body }}
            </p>
            <NuxtLink
              to="/about"
              class="mt-8 inline-block border-b border-inverted pb-1 text-xs uppercase tracking-widest text-inverted no-underline transition hover:opacity-60"
            >
              {{ readMoreCta }}
            </NuxtLink>
          </div>
        </div>
      </template>

      <!-- Empty state: owner hasn't added story yet -->
      <template v-else>
        <p class="saya-eyebrow mb-8 text-inverted/60">{{ ourStoryKicker }}</p>
        <h2 class="saya-display-md max-w-3xl text-inverted/30">{{ brandStoryPlaceholder }}</h2>
        <p class="mt-6 max-w-lg text-sm leading-relaxed text-inverted/30">
          {{ brandStoryDescription }}
        </p>
        <NuxtLink
          v-if="isAuthenticated"
          to="/dashboard"
          class="mt-8 inline-flex items-center gap-2 rounded-full border border-inverted/20 px-5 py-2.5 text-xs uppercase tracking-widest text-inverted/60 no-underline transition hover:border-inverted/40 hover:text-inverted/80"
        >
          {{ addStoryCta }}
        </NuxtLink>
      </template>
  </AppSection>
</template>

<script setup lang="ts">
import AppSection from '~/components/ui/AppSection.vue'

interface Props {
  data?: {
    headline?: string
    body?: string
    image?: string
    isAuthenticated?: boolean
    ourStoryKicker?: string
    readMoreCta?: string
    brandStoryPlaceholder?: string
    brandStoryDescription?: string
    addStoryCta?: string
  }
}

const props = withDefaults(defineProps<Props>(), {
  data: () => ({})
})

const headline = computed(() => props.data?.headline || '')
const body = computed(() => props.data?.body || '')
const image = computed(() => props.data?.image || '')
const isAuthenticated = computed(() => props.data?.isAuthenticated || false)
const ourStoryKicker = computed(() => props.data?.ourStoryKicker || 'Our story')
const readMoreCta = computed(() => props.data?.readMoreCta || 'Read more →')
const brandStoryPlaceholder = computed(() => props.data?.brandStoryPlaceholder || 'Your brand story goes here.')
const brandStoryDescription = computed(() => props.data?.brandStoryDescription || 'Two or three sentences about your brand — what you do, how you do it, why it matters.')
const addStoryCta = computed(() => props.data?.addStoryCta || 'Add your story in the dashboard →')
</script>
