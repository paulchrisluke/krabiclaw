<template>
  <button :data-social-post="post.id" type="button" class="block w-full overflow-hidden bg-default text-start text-default focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" :aria-label="post.title || post.body || t('social_posts.media_label', { count: post.media.length })" @click="$emit('open')">
    <span v-if="post.publications.length" class="flex items-center gap-3 px-5 py-4">
      <SocialPostChannels :publications="post.publications" :linked="false" item-class="inline-flex items-center gap-2 text-sm font-semibold [&_.size-4]:size-6" />
    </span>
    <span v-if="post.media[0]" class="relative block aspect-[4/5] overflow-hidden rounded-[var(--ui-radius)] bg-elevated">
      <video v-if="post.media[0].kind === 'video' && !post.media[0].thumbnail_url" :src="post.media[0].public_url" muted playsinline preload="metadata" class="size-full object-contain" />
      <img v-else :src="post.media[0].kind === 'video' ? post.media[0].thumbnail_url! : post.media[0].public_url" :alt="post.media[0].alt_text ?? ''" loading="lazy" decoding="async" class="size-full object-contain">
      <UIcon v-if="post.media[0].kind === 'video'" name="i-lucide-play" class="absolute bottom-4 end-4 size-8 rounded-full bg-black/60 p-1 text-white" />
    </span>
    <span class="block p-5 sm:p-6">
      <span v-if="post.title" class="mb-2 block text-lg font-semibold">{{ post.title }}</span>
      <span v-if="post.body" class="line-clamp-3 whitespace-pre-line break-words text-base leading-relaxed [overflow-wrap:anywhere]">{{ post.body }}</span>
    </span>
  </button>
</template>
<script setup lang="ts">
import SocialPostChannels from '~/components/social/SocialPostChannels.vue'
import type { PublicSocialPost } from '~/server/utils/post-management'
defineProps<{ post: PublicSocialPost }>()
defineEmits<{ open: [] }>()
const { t } = useI18n()
</script>
