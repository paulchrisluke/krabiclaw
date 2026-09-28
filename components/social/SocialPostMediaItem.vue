<template>
  <!-- The item fills the frame it is given; the frame sets the proportions. -->
  <div class="relative size-full overflow-hidden bg-black/5">
    <template v-if="item.kind === 'video'">
      <video
        v-if="playing"
        :src="item.public_url"
        :poster="item.thumbnail_url || undefined"
        controls
        autoplay
        playsinline
        preload="metadata"
        class="absolute inset-0 size-full bg-black object-contain"
      />
      <button
        v-else
        type="button"
        class="group absolute inset-0 block size-full"
        :aria-label="t('social_posts.play_video')"
        @click="playing = true"
      >
        <img
          :src="item.thumbnail_url || undefined"
          :alt="item.alt_text || ''"
          :width="item.width || undefined"
          :height="item.height || undefined"
          :loading="eager ? 'eager' : 'lazy'"
          decoding="async"
          :class="['size-full', fit === 'cover' ? 'object-cover' : 'object-contain']"
        >
        <span class="absolute inset-0 flex items-center justify-center">
          <span class="flex size-14 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition group-hover:bg-black/75 group-focus-visible:bg-black/75">
            <svg viewBox="0 0 24 24" class="ms-0.5 size-6" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </span>
      </button>
    </template>
    <img
      v-else
      :src="item.public_url"
      :alt="item.alt_text || ''"
      :width="item.width || undefined"
      :height="item.height || undefined"
      :loading="eager ? 'eager' : 'lazy'"
      decoding="async"
      :class="['absolute inset-0 size-full', fit === 'cover' ? 'object-cover' : 'object-contain']"
    >
  </div>
</template>

<script setup lang="ts">
import type { PublicPostMedia } from '~/server/utils/post-management'

defineProps<{ item: PublicPostMedia; fit: 'cover' | 'contain'; eager: boolean }>()
const { t } = useI18n()
const playing = ref(false)
</script>
