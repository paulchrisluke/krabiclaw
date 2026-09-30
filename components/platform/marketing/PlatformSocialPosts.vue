<template>
  <!--
    Krabiclaw's own posts, in the marketing pages' language: a two-line
    headline (the title, then the description muted), and a mosaic of the
    posts' pictures with their words beneath. Opening one shows the posts
    full screen, one after another, the way a social feed does.
  -->
  <section v-if="view.posts.length" class="kc-social" data-parity-section="social-posts">
    <div class="kc-social__inner">
      <div class="kc-social__head">
        <h2 v-if="view.title || view.description" class="kc-social__headline">
          <span v-if="view.title">{{ view.title }}</span>
          <template v-if="view.title && view.description"><br></template>
          <span v-if="view.description" class="kc-social__headline-muted">{{ view.description }}</span>
        </h2>
        <NuxtLink v-if="view.callToAction" :to="route(view.callToAction.url)" class="kc-social__all">
          {{ view.callToAction.label }}<span aria-hidden="true"> →</span>
        </NuxtLink>
      </div>

      <ul class="kc-social__grid">
        <li v-for="post in view.posts" :key="post.id" class="kc-social__post">
          <button type="button" class="kc-social__open" :aria-label="post.title || post.body || undefined" @click="open(post.id)">
            <span class="kc-social__frame">
              <template v-if="post.media[0] && mediaStillUrl(post.media[0])">
                <img :src="mediaStillUrl(post.media[0])!" :alt="post.media[0].alt_text ?? ''" loading="lazy" decoding="async">
                <span v-if="post.media[0].kind === 'video'" class="kc-social__play" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l10.5-6.5z" /></svg>
                </span>
              </template>
              <span v-else class="kc-social__words">{{ post.title || post.body }}</span>
            </span>
          </button>
          <h3 v-if="post.title && post.media.length" class="kc-social__title">{{ post.title }}</h3>
          <p v-if="post.body && post.media.length" class="kc-social__body">{{ post.body }}</p>
        </li>
      </ul>
    </div>

    <MediaLightbox v-model:open="viewerOpen" v-model:index="viewerIndex" :items="viewerItems">
      <template #caption="{ item }">
        <p v-if="item.title" class="text-lg font-semibold leading-snug">{{ item.title }}</p>
        <p v-if="item.description" class="mt-1 line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-white/80">{{ item.description }}</p>
      </template>
    </MediaLightbox>
  </section>
</template>

<script setup lang="ts">
import type { PublicTenantPage } from '~/server/utils/public-tenant-pages'
import type { TenantPageBlock } from '~/utils/tenant-page-blocks'
import { socialPostsBlockView } from '~/utils/social-post-block'
import { isInternalRoute } from '~/utils/tenant-page-block-data'
import { mediaStillUrl } from '~/shared/media-placement-contract'

const props = defineProps<{ block: TenantPageBlock; page: PublicTenantPage }>()
const { localePath } = useI18n()
const view = computed(() => socialPostsBlockView(props.block))
function route(url: string) { return isInternalRoute(url) ? localePath(url) : url }

/** Every picture of every post, in order; a post opens at its first. */
const viewerItems = computed(() => view.value.posts.flatMap(post => post.media.map(media => ({
  postId: post.id,
  url: (media.kind === 'video' ? media.public_url : mediaStillUrl(media)) ?? '',
  kind: media.kind === 'video' ? 'video' as const : 'image' as const,
  alt: media.alt_text ?? '',
  poster: media.thumbnail_url ?? undefined,
  title: post.title ?? '',
  description: post.body ?? '',
}))).filter(item => item.url))

const viewerOpen = ref(false)
const viewerIndex = ref(0)

function open(postId: string) {
  const at = viewerItems.value.findIndex(item => item.postId === postId)
  if (at < 0) return
  viewerIndex.value = at
  viewerOpen.value = true
}
</script>

<style scoped>
.kc-social {
  padding: clamp(4rem, 9vw, 7rem) 0;
  background: var(--ui-bg);
  color: var(--ui-text);
}

.kc-social__inner {
  width: min(100% - clamp(2rem, 6vw, 6rem), 80rem);
  margin: 0 auto;
}

.kc-social__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: clamp(2.5rem, 5vw, 4rem);
}

.kc-social__headline {
  margin: 0;
  color: var(--ui-text-highlighted);
  font-size: clamp(2.1rem, 5.2vw, 5rem);
  line-height: 1.12;
  letter-spacing: -0.02em;
}

.kc-social__headline-muted {
  color: var(--ui-text-dimmed);
}

.kc-social__all {
  color: var(--ui-text-highlighted);
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.kc-social__all:hover {
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.kc-social__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(1.5rem, 3vw, 3rem);
  margin: 0;
  padding: 0;
  list-style: none;
}



.kc-social__open {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  cursor: zoom-in;
}

.kc-social__frame {
  position: relative;
  display: block;
  aspect-ratio: 4 / 5;
  overflow: hidden;
  border-radius: 1rem;
  background: var(--ui-bg-elevated);
}

.kc-social__frame img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: transform 0.5s ease;
}

.kc-social__open:hover .kc-social__frame img {
  transform: scale(1.03);
}

.kc-social__play {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 999px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
}

.kc-social__play svg {
  width: 1rem;
  height: 1rem;
}

.kc-social__open:focus-visible {
  border-radius: 1rem;
  outline: 2px solid var(--kc-coral-400);
  outline-offset: 4px;
}

.kc-social__words {
  display: flex;
  align-items: flex-end;
  height: 100%;
  padding: clamp(1rem, 2vw, 2rem);
  color: var(--ui-text-highlighted);
  font-size: clamp(1.1rem, 1.8vw, 1.6rem);
  line-height: 1.3;
  text-align: start;
}

.kc-social__title {
  margin: 1rem 0 0;
  color: var(--ui-text-highlighted);
  font-size: 1.125rem;
  font-weight: 500;
  line-height: 1.35;
}

.kc-social__body {
  display: -webkit-box;
  margin: 0.375rem 0 0;
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 0.9375rem;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

@media (max-width: 767px) {
  .kc-social__grid {
    grid-template-columns: minmax(0, 1fr);
  }

}
</style>
