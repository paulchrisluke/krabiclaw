<template>
  <!--
    Blawby's short posts: restrained professional update cards on the firm's
    ivory, with navy type, a thin rule and a 4:3 picture when the post has one.
    Not the article grid and not a feature card: an update reads as a dated
    note from the firm, and each card's main link is the update's own page.
  -->
  <section v-if="view.posts.length || !block" class="bg-[var(--blawby-bg)] py-16 sm:py-20" :data-social-posts="block ? 'block' : 'feed'">
    <div class="blawby-container">
      <div v-if="view.title || view.description || view.callToAction" class="mb-10 flex flex-col gap-6 border-b border-[var(--blawby-border)] pb-8 md:flex-row md:items-end md:justify-between">
        <BlawbySectionHeading v-if="view.title" :title="view.title" :description="view.description" />
        <p v-else-if="view.description" class="max-w-2xl text-lg leading-8 text-[var(--blawby-primary)]">{{ view.description }}</p>
        <BlawbyButton v-if="view.callToAction" :to="route(view.callToAction.url)">{{ view.callToAction.label }}</BlawbyButton>
      </div>

      <ul class="grid grid-cols-1 gap-8 md:grid-cols-2">
        <li v-for="post in view.posts" :key="post.id" class="flex min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--blawby-border)] bg-[var(--blawby-surface)]">
          <SocialPostMedia v-if="post.media.length" :media="post.media" frame-class="aspect-[4/3] border-b border-[var(--blawby-border)]" />
          <div class="flex grow flex-col p-6 sm:p-8">
            <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--blawby-primary)]/75">
              <time v-if="post.published_at" :datetime="post.published_at" class="font-semibold uppercase tracking-wide text-[var(--blawby-accent-strong)]">{{ formatDate(post.published_at) }}</time>
              <SocialPostChannels :publications="post.publications" item-class="inline-flex items-center gap-1.5 rounded-full border border-[var(--blawby-border)] px-2.5 py-1 text-xs font-medium text-[var(--blawby-primary)] no-underline transition hover:border-[var(--blawby-accent)]" />
            </div>
            <h3 v-if="post.title" class="blawby-display mt-4 text-xl font-bold leading-snug text-[var(--blawby-primary)]">{{ post.title }}</h3>
            <p v-if="post.body" :class="['mt-3 whitespace-pre-line text-base leading-7 text-[var(--blawby-ink)]', post.media.length ? 'line-clamp-4' : 'line-clamp-[9]']">{{ post.body }}</p>
            <p v-if="post.location" class="mt-4 text-sm text-[var(--blawby-primary)]/75">{{ post.location.title }}</p>
            <div class="mt-auto pt-6">
              <NuxtLink :to="localePath(`/posts/${post.slug}`)" class="inline-flex items-center gap-2 border-b border-[var(--blawby-accent)] pb-0.5 text-sm font-semibold text-[var(--blawby-primary)] no-underline hover:text-[var(--blawby-accent-strong)]">
                {{ t('blawby.posts.view_update') }}<span class="sr-only">: {{ post.title || formatDate(post.published_at) }}</span>
              </NuxtLink>
            </div>
          </div>
        </li>
      </ul>

      <p v-if="!block && !view.posts.length" class="rounded-lg border border-dashed border-[var(--blawby-border)] p-10 text-center text-[var(--blawby-primary)]">{{ t('blawby.posts.empty') }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import SocialPostMedia from '~/components/social/SocialPostMedia.vue'
import SocialPostChannels from '~/components/social/SocialPostChannels.vue'
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { PublicSocialPost } from '~/server/utils/post-management'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { socialPostsBlockView } from '~/utils/social-post-block'
import { isInternalRoute } from '~/utils/tenant-page-block-data'

const props = defineProps<{ block?: TenantPageBlock; page?: PublicTenantPage; posts?: PublicSocialPost[] }>()
const { t, localePath } = useI18n()
const { formatDate } = useLocaleDate()
const view = computed(() => props.block ? socialPostsBlockView(props.block) : { title: null, description: null, callToAction: null, posts: props.posts ?? [] })
function route(url: string) { return isInternalRoute(url) ? localePath(url) : url }
</script>
