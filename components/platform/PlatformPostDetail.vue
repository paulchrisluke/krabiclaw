<template>
  <article class="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between gap-4">
      <NuxtLink to="/posts" class="text-sm font-medium text-muted no-underline hover:text-default">← All updates</NuxtLink>
      <SocialPostShare :title="post.title" button-class="inline-flex items-center gap-2 rounded-lg border border-default px-3 py-1.5 text-sm font-semibold text-default hover:bg-elevated" />
    </div>
    <p class="kc-eyebrow mt-10 text-muted"><time v-if="post.published_at" :datetime="post.published_at">{{ formatDate(post.published_at) }}</time></p>
    <h1 v-if="post.title" class="m-0 mt-3 text-[clamp(30px,4vw,46px)] font-extrabold leading-[1.08] tracking-tight text-default">{{ post.title }}</h1>
    <div :class="post.media.length ? 'mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]' : 'mt-6 max-w-3xl'">
      <div v-if="post.media.length" class="overflow-hidden rounded-[18px] border border-default">
        <SocialPostMedia :media="post.media" eager frame-class="aspect-video" />
      </div>
      <div class="min-w-0">
        <p v-if="post.body" class="m-0 whitespace-pre-line text-[17px] leading-relaxed text-default">{{ post.body }}</p>
        <PlatformButton v-if="post.call_to_action" class="mt-6" :to="post.call_to_action.url">{{ post.call_to_action.label }}</PlatformButton>
        <div v-if="post.publications.length" class="mt-6 border-t border-default pt-5">
          <SocialPostChannels :publications="post.publications" item-class="inline-flex items-center gap-2 rounded-full border border-default px-3 py-1.5 text-sm font-medium text-default no-underline hover:bg-elevated" />
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import SocialPostMedia from '~/components/social/SocialPostMedia.vue'
import SocialPostChannels from '~/components/social/SocialPostChannels.vue'
import SocialPostShare from '~/components/social/SocialPostShare.vue'
import PlatformButton from '~/components/platform/PlatformButton.vue'
import type { PublicSocialPost } from '~/server/utils/post-management'

defineProps<{ post: PublicSocialPost }>()
const { formatDate } = useLocaleDate()
</script>
