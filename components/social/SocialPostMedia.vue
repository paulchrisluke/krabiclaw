<template>
  <!--
    A post's own media, in its author's order: one picture or video, or the
    whole set as a scroll-snapped strip the browser swipes and scrolls itself,
    with arrows and dots for pointers. A video is never started for the
    visitor: its real poster shows, with a play control. Nothing is drawn for a
    post without media. Public surfaces carry no component library, so this is
    plain markup in the template's own tokens.
  -->
  <div v-if="media.length === 1" :class="[frameClass, 'relative']">
    <SocialPostMediaItem :item="media[0]!" :fit="fit" :eager="eager" />
  </div>
  <div
    v-else-if="media.length > 1"
    :class="[frameClass, 'relative']"
    role="region"
    aria-roledescription="carousel"
    :aria-label="t('social_posts.media_label', { count: media.length })"
  >
    <ul
      ref="track"
      class="absolute inset-0 m-0 flex list-none snap-x snap-mandatory overflow-x-auto overscroll-x-contain p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      tabindex="0"
      @scroll.passive="onScroll"
    >
      <li
        v-for="(item, index) in media"
        :key="item.asset_id"
        class="relative size-full shrink-0 snap-start"
        :aria-label="t('social_posts.media_position', { position: index + 1, count: media.length })"
      >
        <SocialPostMediaItem :item="item" :fit="fit" :eager="eager && index === 0" />
      </li>
    </ul>
    <button v-if="current > 0" type="button" :class="[arrowClass, 'start-3']" :aria-label="t('social_posts.previous_media')" @click="show(current - 1)">
      <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
    </button>
    <button v-if="current < media.length - 1" type="button" :class="[arrowClass, 'end-3']" :aria-label="t('social_posts.next_media')" @click="show(current + 1)">
      <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
    </button>
    <div class="absolute inset-x-0 bottom-3 flex justify-center gap-2">
      <button
        v-for="(item, index) in media"
        :key="item.asset_id"
        type="button"
        :class="['size-2 rounded-full shadow', index === current ? 'bg-white' : 'bg-white/55']"
        :aria-label="t('social_posts.media_position', { position: index + 1, count: media.length })"
        :aria-current="index === current ? 'true' : undefined"
        @click="show(index)"
      />
    </div>
  </div>
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
const track = ref<HTMLUListElement | null>(null)
const current = ref(0)
const arrowClass = 'absolute top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white shadow transition hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

function onScroll() {
  const element = track.value
  if (element && element.clientWidth) current.value = Math.round(Math.abs(element.scrollLeft) / element.clientWidth)
}
function show(index: number) {
  const element = track.value
  if (!element) return
  const direction = getComputedStyle(element).direction === 'rtl' ? -1 : 1
  element.scrollTo({ left: direction * index * element.clientWidth, behavior: reducedMotion.value === 'reduce' ? 'auto' : 'smooth' })
}
</script>
