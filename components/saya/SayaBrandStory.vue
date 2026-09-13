<template>
  <AppSection v-if="title || body" bg="black" padding="xl">
    <div :class="image ? 'grid gap-16 lg:grid-cols-2 lg:items-center' : ''">
      <div v-if="image" class="overflow-hidden">
        <UImage
          :src="image"
          alt=""
          aria-hidden="true"
          class="aspect-4/3 w-full object-cover"
        />
      </div>
      <div>
        <p class="saya-eyebrow mb-8 text-inverted/60">{{ ourStoryKicker }}</p>
        <h2 v-if="title" class="saya-display-md text-inverted" :class="image ? '' : 'max-w-3xl'">
          {{ title }}
        </h2>
        <p v-if="body" class="mt-8 text-base leading-relaxed text-inverted/60" :class="image ? '' : 'max-w-2xl'">
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
  data: {
    title: string | null
    body: string | null
    image: string | null
    ourStoryKicker: string
    readMoreCta: string
  }
}

const props = defineProps<Props>()

const title = computed(() => props.data.title ?? '')
const body = computed(() => props.data.body ?? '')
const image = computed(() => props.data.image ?? '')
// The kicker and the link's words are the caller's vertical copy, in the
// visitor's locale. An English literal here would have overridden a Thai page's
// own words the moment a caller stopped passing them.
const ourStoryKicker = computed(() => props.data.ourStoryKicker)
const readMoreCta = computed(() => props.data.readMoreCta)
</script>
