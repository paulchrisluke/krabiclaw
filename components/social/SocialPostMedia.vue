<template>
  <!--
    A post's own media, in its author's order: one picture or video, or the
    whole set in the installed carousel (swipe, arrows, dots, keys). A video is
    never started for the visitor: its real poster shows, with a play control.
    Nothing is drawn for a post without media.
  -->
  <div v-if="media.length === 1" :class="frameClass">
    <SocialPostMediaItem :item="media[0]!" :fit="fit" :eager="eager" />
  </div>
  <UCarousel
    v-else-if="media.length > 1"
    v-slot="{ item }"
    :items="media"
    arrows
    dots
    :duration="reducedMotion === 'reduce' ? 0 : 25"
    :prev="{ color: 'neutral', variant: 'solid' }"
    :next="{ color: 'neutral', variant: 'solid' }"
    :ui="{ root: 'relative', viewport: frameClass, item: 'basis-full ps-0', container: 'ms-0 h-full', prev: 'start-3', next: 'end-3', dots: 'bottom-3', dot: 'bg-white/60 data-[state=active]:bg-white' }"
    :aria-label="t('social_posts.media_label', { count: media.length })"
  >
    <SocialPostMediaItem :item="item" :fit="fit" :eager="eager && item === media[0]" />
  </UCarousel>
</template>

<script setup lang="ts">
import { usePreferredReducedMotion } from '@vueuse/core'
import SocialPostMediaItem from '~/components/social/SocialPostMediaItem.vue'
import type { PublicPostMedia } from '~/server/utils/post-management'

withDefaults(defineProps<{
  media: PublicPostMedia[]
  /** The frame the template gives the media: its proportions and corners. */
  frameClass?: string
  fit?: 'cover' | 'contain'
  eager?: boolean
}>(), { frameClass: 'aspect-square', fit: 'cover', eager: false })

const { t } = useI18n()
const reducedMotion = usePreferredReducedMotion()
</script>
