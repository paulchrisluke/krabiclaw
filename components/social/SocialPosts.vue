<template>
  <section v-if="view.posts.length || !block" class="bg-default text-default" :data-social-posts="block ? 'block' : 'feed'">
    <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div v-if="view.title || view.description || view.callToAction" class="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div class="max-w-3xl">
          <h2 v-if="view.title" class="font-[family-name:var(--font-heading)] [font-weight:var(--font-heading-weight)] text-3xl leading-tight text-highlighted sm:text-5xl">{{ view.title }}</h2>
          <p v-if="view.description" class="mt-3 text-xl leading-relaxed text-muted sm:text-2xl">{{ view.description }}</p>
        </div>
        <NuxtLink v-if="view.callToAction" :to="route(view.callToAction.url)" class="inline-flex items-center gap-2 text-sm font-semibold text-highlighted no-underline hover:underline">{{ view.callToAction.label }}<span aria-hidden="true">→</span></NuxtLink>
      </div>

      <ul :class="['m-0 list-none p-0', block ? 'flex snap-x snap-mandatory gap-6 overflow-x-auto overscroll-x-contain pb-6 sm:gap-8' : 'mx-auto flex max-w-2xl flex-col gap-10 sm:gap-12']">
        <li v-for="(post, index) in view.posts" :key="post.id" :class="['min-w-0', block ? 'w-[85%] max-w-md shrink-0 snap-start sm:w-[26rem]' : 'w-full']">
          <article class="overflow-hidden rounded-[calc(var(--ui-radius)*2)] border border-default bg-elevated">
            <SocialPostMedia
              v-if="post.media.length"
              :media="post.media"
              :description="post.body ?? undefined"
              :gallery="gallery"
              :gallery-index="galleryIndex(post.id)"
              :eager="index === 0 && !block"
              fit="contain"
              frame-class="aspect-[4/5] overflow-hidden bg-elevated"
            />
            <div class="p-6 sm:p-8">
              <div class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                <time v-if="post.published_at" :datetime="post.published_at">{{ formatDate(post.published_at) }}</time>
                <span v-if="post.location">{{ post.location.title }}</span>
                <SocialPostChannels :publications="post.publications" item-class="inline-flex items-center gap-1.5 text-xs text-muted no-underline hover:text-default" />
              </div>
              <h3 v-if="post.title" class="font-[family-name:var(--font-heading)] [font-weight:var(--font-heading-weight)] mb-3 text-xl leading-snug text-highlighted">{{ post.title }}</h3>
              <p v-if="post.body" :class="['whitespace-pre-line break-words text-base leading-relaxed text-default [overflow-wrap:anywhere]', block ? 'line-clamp-4' : '']">{{ post.body }}</p>
              <NuxtLink :to="localePath(`/posts/${post.slug}`)" class="relative mt-5 inline-flex items-center gap-2 text-sm font-semibold text-highlighted no-underline hover:underline">
                {{ t('social_posts.view_update') }}<span class="sr-only">: {{ post.title || formatDate(post.published_at) }}</span><span aria-hidden="true">→</span>
              </NuxtLink>
            </div>
          </article>
        </li>
      </ul>
      <p v-if="!block && !view.posts.length" class="rounded-[calc(var(--ui-radius)*2)] border border-dashed border-default p-10 text-center text-muted">{{ t('social_posts.empty') }}</p>
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

const props = defineProps<{
  block?: TenantPageBlock
  page?: PublicTenantPage
  /** The feed, when this draws /posts rather than a page block. */
  posts?: PublicSocialPost[]
}>()
const { t, localePath } = useI18n()
const { formatDate } = useLocaleDate()
const view = computed(() => props.block ? socialPostsBlockView(props.block) : { title: null, description: null, callToAction: null, posts: props.posts ?? [] })
const gallery = computed(() => view.value.posts.flatMap(post => post.media.map(media => ({ url: media.public_url, kind: media.kind, alt: media.alt_text ?? '', poster: media.thumbnail_url ?? undefined, description: post.body ?? undefined }))))
function galleryIndex(postId: string) {
  let index = 0
  for (const post of view.value.posts) {
    if (post.id === postId) return index
    index += post.media.length
  }
  return 0
}
function route(url: string) { return isInternalRoute(url) ? localePath(url) : url }
</script>
