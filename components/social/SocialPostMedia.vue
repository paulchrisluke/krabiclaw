<template>
  <div v-if="media.length" :class="[frameClass, 'relative']">
    <button
      type="button"
      class="absolute inset-0 size-full cursor-zoom-in overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      :aria-label="media[0]!.kind === 'video' ? t('social_posts.play_video') : t('social_posts.media_label', { count: media.length })"
      @click="index = galleryIndex; open = true"
    >
      <video
        v-if="media[0]!.kind === 'video' && !media[0]!.thumbnail_url"
        :src="media[0]!.public_url"
        muted
        playsinline
        preload="metadata"
        :class="['size-full', fit === 'cover' ? 'object-cover' : 'object-contain']"
      />
      <img
        v-else
        :src="media[0]!.kind === 'video' ? media[0]!.thumbnail_url! : media[0]!.public_url"
        :alt="media[0]!.alt_text ?? ''"
        :width="media[0]!.width ?? undefined"
        :height="media[0]!.height ?? undefined"
        :loading="eager ? 'eager' : 'lazy'"
        decoding="async"
        :class="['size-full', fit === 'cover' ? 'object-cover' : 'object-contain']"
      >
      <span v-if="media[0]!.kind === 'video'" class="absolute inset-0 grid place-items-center" aria-hidden="true">
        <span class="grid size-14 place-items-center rounded-full bg-black/60 text-white">
          <svg viewBox="0 0 24 24" class="size-6" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </span>
      </span>
      <span v-if="media.length > 1" class="absolute end-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white" aria-hidden="true">{{ media.length }}</span>
    </button>
    <MediaLightbox v-model:open="open" v-model:index="index" :items="items" :title="title" />
  </div>
</template>

<script setup lang="ts">
import type { PublicPostMedia } from '~/server/utils/post-management'

const props = withDefaults(defineProps<{
  gallery?: { url: string; kind: 'image' | 'video'; alt?: string; poster?: string; description?: string }[]
  galleryIndex?: number
  media: PublicPostMedia[]
  frameClass?: string
  fit?: 'cover' | 'contain'
  eager?: boolean
  title?: string
  description?: string
}>(), { gallery: undefined, galleryIndex: 0, frameClass: 'aspect-square', fit: 'cover', eager: false, title: undefined, description: undefined })
const { t } = useI18n()
const open = ref(false)
const index = ref(0)
const items = computed(() => props.gallery ?? props.media.map(item => ({
  url: item.public_url, kind: item.kind, alt: item.alt_text ?? '', poster: item.thumbnail_url ?? undefined, description: props.description,
})))
</script>
