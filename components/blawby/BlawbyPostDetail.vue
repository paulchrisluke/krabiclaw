<template>
  <!--
    A firm's update in its own composition: a navy title band with the date and
    where else it was posted, then the note beside its picture on desktop — or,
    for a text-only update, one readable column with no empty media frame.
  -->
  <article class="bg-[var(--blawby-bg)] pb-20">
    <header class="bg-[var(--blawby-primary)] pb-10 pt-20 text-white sm:pb-14 sm:pt-24">
      <div class="blawby-container">
        <div class="flex items-center justify-between gap-4">
          <NuxtLink :to="localePath('/posts')" class="inline-flex items-center gap-2 text-sm font-medium text-white/80 no-underline hover:text-white">
            <span aria-hidden="true">←</span> {{ t('blawby.posts.back') }}
          </NuxtLink>
          <SocialPostShare :title="post.title" button-class="inline-flex items-center gap-2 rounded-md border border-white/30 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10" />
        </div>
        <p class="mt-8 text-sm font-semibold uppercase tracking-wider text-[var(--blawby-accent)]">
          <time v-if="post.published_at" :datetime="post.published_at">{{ formatDate(post.published_at) }}</time>
          <span v-if="post.location"> · {{ post.location.title }}</span>
        </p>
        <h1 class="blawby-display mt-3 max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">{{ post.title || brand.name }}</h1>
      </div>
    </header>

    <div class="blawby-container mt-10">
      <div :class="post.media.length ? 'grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]' : 'mx-auto max-w-3xl'">
        <div v-if="post.media.length" class="overflow-hidden rounded-lg border border-[var(--blawby-border)] bg-[var(--blawby-surface)]">
          <SocialPostMedia :media="post.media" eager frame-class="aspect-[4/3]" />
        </div>
        <div class="min-w-0">
          <p v-if="post.body" class="whitespace-pre-line text-lg leading-8 text-[var(--blawby-ink)]">{{ post.body }}</p>
          <div v-if="post.call_to_action" class="mt-8">
            <BlawbyButton :to="route(post.call_to_action.url)">{{ post.call_to_action.label }}</BlawbyButton>
          </div>
          <div v-if="post.publications.length" class="mt-8 border-t border-[var(--blawby-border)] pt-6">
            <SocialPostChannels :publications="post.publications" item-class="inline-flex items-center gap-2 rounded-full border border-[var(--blawby-border)] bg-[var(--blawby-surface)] px-3 py-1.5 text-sm font-medium text-[var(--blawby-primary)] no-underline hover:border-[var(--blawby-accent)]" />
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import SocialPostMedia from '~/components/social/SocialPostMedia.vue'
import SocialPostChannels from '~/components/social/SocialPostChannels.vue'
import SocialPostShare from '~/components/social/SocialPostShare.vue'
import type { PublicSocialPost } from '~/server/utils/post-management'
import { isInternalRoute } from '~/utils/tenant-page-block-data'

defineProps<{ post: PublicSocialPost; brand: { name: string; logoUrl: string | null } }>()
const { localePath, t } = useI18n()
const { formatDate } = useLocaleDate()
function route(url: string) { return isInternalRoute(url) ? localePath(url) : url }
</script>
