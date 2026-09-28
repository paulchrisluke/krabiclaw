<template>
  <!--
    Saya's short posts: media-led cards in its own type and tokens. The same
    component is a homepage block and the /posts feed. Each card's main link is
    its own page; where else it was posted are separate links beside it.
  -->
  <section v-if="view.posts.length || !block" class="bg-default text-default" :data-social-posts="block ? 'block' : 'feed'">
    <div class="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div v-if="view.title || view.description || view.callToAction" class="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div class="max-w-2xl">
          <p v-if="view.description" class="saya-kicker mb-5">{{ view.description }}</p>
          <h2 v-if="view.title" class="saya-display-md text-default">{{ view.title }}</h2>
        </div>
        <SayaButton v-if="view.callToAction" :to="route(view.callToAction.url)" variant="outline">{{ view.callToAction.label }}</SayaButton>
      </div>

      <ul class="grid grid-cols-1 gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
        <li v-for="post in view.posts" :key="post.id" class="flex min-w-0 flex-col">
          <SocialPostMedia
            v-if="post.media.length"
            :media="post.media"
            frame-class="aspect-[4/5] overflow-hidden rounded-sm"
          />
          <div :class="['flex grow flex-col', post.media.length ? 'pt-5' : 'border-t border-default pt-6']">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted">
              <time v-if="post.published_at" :datetime="post.published_at" class="saya-eyebrow">{{ formatDate(post.published_at) }}</time>
              <SocialPostChannels :publications="post.publications" item-class="inline-flex items-center gap-1.5 text-xs text-muted no-underline transition hover:text-default" />
            </div>
            <h3 v-if="post.title" class="saya-display mt-3 text-2xl leading-tight text-default">{{ post.title }}</h3>
            <p v-if="post.body" :class="['mt-3 whitespace-pre-line text-default', post.media.length ? 'line-clamp-4 text-sm leading-relaxed' : 'line-clamp-[8] text-lg leading-relaxed']">{{ post.body }}</p>
            <NuxtLink :to="localePath(`/posts/${post.slug}`)" class="saya-eyebrow mt-5 inline-flex items-center gap-2 text-default no-underline hover:underline">
              {{ t('saya.posts.view_update') }}<span class="sr-only">: {{ post.title || formatDate(post.published_at) }}</span>
              <span aria-hidden="true">→</span>
            </NuxtLink>
          </div>
        </li>
      </ul>

      <div v-if="!block && !view.posts.length" class="flex flex-col items-center rounded-3xl border border-dashed border-default bg-muted/20 py-20 text-center">
        <h3 class="saya-display saya-italic text-3xl text-default">{{ t('saya.posts.empty_title') }}</h3>
        <p class="mt-2 max-w-sm text-sm text-muted">{{ t('saya.posts.empty_desc') }}</p>
      </div>
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
