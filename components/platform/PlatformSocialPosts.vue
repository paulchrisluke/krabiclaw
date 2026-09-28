<template>
  <!--
    Krabiclaw's own short posts: the marketing site's hairline cards on its
    elevated wash, navy type and the coral hover edge. Each card's main link is
    the update's page; where else it was posted are separate links.
  -->
  <section v-if="view.posts.length || !block" class="relative py-20" :data-social-posts="block ? 'block' : 'feed'">
    <div class="absolute inset-0 -z-10" style="background: linear-gradient(180deg, var(--ui-bg-elevated) 0%, var(--ui-bg) 100%);"></div>
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div v-if="view.title || view.description || view.callToAction" class="mb-12 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div class="max-w-2xl">
          <span v-if="view.description" class="kc-eyebrow text-muted">{{ view.description }}</span>
          <h2 v-if="view.title" class="m-0 mt-3 text-[clamp(28px,3.5vw,42px)] font-extrabold leading-[1.08] tracking-tight text-default">{{ view.title }}</h2>
        </div>
        <PlatformButton v-if="view.callToAction" :to="view.callToAction.url" variant="outline">{{ view.callToAction.label }}</PlatformButton>
      </div>

      <ul class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <li v-for="post in view.posts" :key="post.id" class="group flex min-w-0 flex-col overflow-hidden rounded-[18px] border border-default bg-white transition hover:-translate-y-0.5 hover:border-(--kc-coral)/30 hover:shadow-lg dark:bg-(--ui-bg-elevated)">
          <SocialPostMedia v-if="post.media.length" :media="post.media" frame-class="aspect-video" />
          <div class="flex grow flex-col p-6">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <time v-if="post.published_at" :datetime="post.published_at" class="text-xs font-semibold uppercase tracking-wider text-muted">{{ formatDate(post.published_at) }}</time>
              <SocialPostChannels :publications="post.publications" item-class="inline-flex items-center gap-1.5 text-xs font-medium text-muted no-underline hover:text-default" />
            </div>
            <h3 v-if="post.title" class="m-0 mt-3 text-lg font-bold leading-snug text-default">{{ post.title }}</h3>
            <p v-if="post.body" :class="['m-0 mt-2 whitespace-pre-line text-[15px] leading-relaxed text-muted', post.media.length ? 'line-clamp-3' : 'line-clamp-[8]']">{{ post.body }}</p>
            <NuxtLink :to="`/posts/${post.slug}`" class="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-(--kc-navy) no-underline hover:text-(--kc-coral) dark:text-default">
              Read the update<span class="sr-only">: {{ post.title || formatDate(post.published_at) }}</span>
              <span aria-hidden="true">→</span>
            </NuxtLink>
          </div>
        </li>
      </ul>
      <p v-if="!block && !view.posts.length" class="rounded-[18px] border border-dashed border-default p-10 text-center text-muted">No updates yet.</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import SocialPostMedia from '~/components/social/SocialPostMedia.vue'
import SocialPostChannels from '~/components/social/SocialPostChannels.vue'
import PlatformButton from '~/components/platform/PlatformButton.vue'
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { PublicSocialPost } from '~/server/utils/post-management'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { socialPostsBlockView } from '~/utils/social-post-block'

const props = defineProps<{ block?: TenantPageBlock; page?: PublicTenantPage; posts?: PublicSocialPost[] }>()
const { formatDate } = useLocaleDate()
const view = computed(() => props.block ? socialPostsBlockView(props.block) : { title: null, description: null, callToAction: null, posts: props.posts ?? [] })
</script>
