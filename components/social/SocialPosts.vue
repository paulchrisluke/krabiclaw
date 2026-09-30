<template>
  <!--
    An organization's short posts as a mosaic, on every template: the newest
    post leads across two columns at 16:9, the rest are squares, media first
    with the words and where else it was posted underneath. A post without
    media shows its words in the frame instead. The same component is a page
    block and the /posts feed. Everything visual comes from the template's own
    tokens — colours, heading face, radius — so there is no per-template markup.
  -->
  <section v-if="view.posts.length || !block" class="bg-default text-default" :data-social-posts="block ? 'block' : 'feed'">
    <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div v-if="view.title || view.description || view.callToAction" class="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div class="max-w-2xl">
          <p v-if="view.description" class="mb-3 text-sm font-medium uppercase tracking-[0.14em] text-muted">{{ view.description }}</p>
          <h2 v-if="view.title" class="font-[family-name:var(--font-heading)] [font-weight:var(--font-heading-weight)] text-3xl leading-tight text-highlighted sm:text-4xl">{{ view.title }}</h2>
        </div>
        <NuxtLink v-if="view.callToAction" :to="route(view.callToAction.url)" class="inline-flex items-center self-start rounded-[var(--ui-radius)] bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary no-underline transition hover:opacity-90 md:self-auto">{{ view.callToAction.label }}</NuxtLink>
      </div>

      <ul class="m-0 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="(post, index) in view.posts" :key="post.id" :class="['flex min-w-0 flex-col', index === 0 ? 'sm:col-span-2' : '']">
          <SocialPostMedia
            v-if="post.media.length"
            :media="post.media"
            :title="post.title ?? undefined"
            :description="post.body ?? undefined"
            :eager="index === 0 && !block"
            :frame-class="`${index === 0 ? 'aspect-video' : 'aspect-square'} overflow-hidden rounded-[calc(var(--ui-radius)*2)] bg-elevated`"
          />
          <NuxtLink
            v-else
            :to="localePath(`/posts/${post.slug}`)"
            :class="[index === 0 ? 'aspect-video' : 'aspect-square', 'flex flex-col justify-end overflow-hidden rounded-[calc(var(--ui-radius)*2)] border border-default bg-elevated p-6 text-default no-underline transition hover:border-accented sm:p-8']"
            tabindex="-1"
            aria-hidden="true"
          >
            <span :class="['font-[family-name:var(--font-heading)] [font-weight:var(--font-heading-weight)] whitespace-pre-line text-highlighted', index === 0 ? 'line-clamp-5 text-2xl leading-snug sm:text-3xl' : 'line-clamp-6 text-xl leading-snug']">{{ post.title || post.body }}</span>
          </NuxtLink>

          <div class="flex grow flex-col pt-4">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              <time v-if="post.published_at" :datetime="post.published_at" class="font-medium uppercase tracking-[0.12em] text-xs">{{ formatDate(post.published_at) }}</time>
              <span v-if="post.location">{{ post.location.title }}</span>
              <SocialPostChannels :publications="post.publications" item-class="inline-flex items-center gap-1.5 text-xs text-muted no-underline transition hover:text-default" />
            </div>
            <h3 v-if="post.title && post.media.length" class="font-[family-name:var(--font-heading)] [font-weight:var(--font-heading-weight)] mt-2 text-xl leading-snug text-highlighted">{{ post.title }}</h3>
            <p v-if="post.body && (post.media.length || post.title)" class="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-default">{{ post.body }}</p>
            <NuxtLink :to="localePath(`/posts/${post.slug}`)" class="mt-3 inline-flex items-center gap-2 self-start text-sm font-semibold text-highlighted no-underline hover:underline">
              {{ t('social_posts.view_update') }}<span class="sr-only">: {{ post.title || formatDate(post.published_at) }}</span>
              <span aria-hidden="true">→</span>
            </NuxtLink>
          </div>
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
function route(url: string) { return isInternalRoute(url) ? localePath(url) : url }
</script>
