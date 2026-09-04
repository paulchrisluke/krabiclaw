<template>
  <AppSection v-if="headline || body || image" bg="black" padding="xl">
    <div :class="image ? 'grid gap-16 lg:grid-cols-2 lg:items-center' : ''">
      <div v-if="image" class="overflow-hidden">
        <UImage
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
          :to="localePath('/about')"
          class="mt-8 inline-block border-b border-inverted pb-1 text-xs uppercase tracking-widest text-inverted no-underline transition hover:opacity-60"
        >
          {{ readMoreCta }}
        </NuxtLink>
      </div>
    </div>
  </AppSection>
</template>

<script setup lang="ts">
import AppSection from '~/components/ui/AppSection.vue'

const { localePath } = useI18n()

interface Props {
  data?: {
    headline?: string
    body?: string
    image?: string
    ourStoryKicker?: string
    readMoreCta?: string
  }
}

const props = withDefaults(defineProps<Props>(), {
  data: () => ({}),
})

const headline = computed(() => props.data?.headline || '')
const body = computed(() => props.data?.body || '')
const image = computed(() => props.data?.image || '')
const ourStoryKicker = computed(() => props.data?.ourStoryKicker || 'Our story')
const readMoreCta = computed(() => props.data?.readMoreCta || 'Read more →')
</script>
