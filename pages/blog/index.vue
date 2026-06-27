<template>
  <div class="space-y-16">
    <div class="max-w-3xl">
      <h1 class="mb-6 text-5xl font-bold text-default">Business Blog</h1>
      <p class="text-xl text-muted">
        Tips, insights, and stories to help your business thrive in the digital age.
      </p>
    </div>

    <div v-if="posts.length === 0" class="py-24 text-center text-muted">
      <p class="mb-2 text-xl">No posts yet</p>
      <p class="text-sm">Check back soon — new content is on the way.</p>
    </div>

    <div v-else class="space-y-16">
      <NuxtLink v-if="featuredPostPath && featuredPost" :to="featuredPostPath" class="block">
        <div class="overflow-hidden rounded-2xl bg-elevated shadow-lg transition-shadow hover:shadow-xl">
          <div v-if="featuredMedia.url" class="h-64 overflow-hidden">
            <video
              v-if="featuredMedia.isVideo"
              :src="featuredMedia.url ?? undefined"
              autoplay
              muted
              loop
              playsinline
              class="h-full w-full object-cover"
            />
            <img
              v-else
              :src="featuredMedia.url ?? undefined"
              :alt="featuredPost.title"
              class="h-full w-full object-cover"
            />
          </div>
          <div v-else class="h-64 bg-linear-to-br from-teal-50 to-teal-100 dark:from-teal-900/20 dark:to-teal-800/20" />
          <div class="p-8">
            <div class="mb-4 flex items-center gap-4">
              <span class="rounded-full bg-inverted px-3 py-1 text-sm font-medium text-inverted">Featured</span>
              <span v-if="featuredPost.category" class="rounded-full px-3 py-1 text-sm font-medium" :class="blogCategoryClass(featuredPost.category)">
                {{ featuredPost.category }}
              </span>
              <span v-if="featuredPost.published_at" class="text-sm text-dimmed">
                <NuxtTime :datetime="featuredPost.published_at" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
              </span>
            </div>
            <h2 class="mb-4 text-3xl font-bold text-default">{{ featuredPost.title }}</h2>
            <p v-if="featuredPost.excerpt" class="mb-6 text-lg text-muted">{{ featuredPost.excerpt }}</p>
            <div class="flex items-center justify-between">
              <p class="text-sm text-dimmed">{{ readTime(featuredPost) }} min read</p>
              <span class="text-sm font-semibold" style="color: var(--kc-teal)">Read Article →</span>
            </div>
          </div>
        </div>
      </NuxtLink>

      <section
        v-for="group in categories"
        :id="group.categorySlug"
        :key="group.categorySlug"
        class="scroll-mt-28 space-y-6"
      >
        <div class="flex flex-wrap items-end justify-between gap-3 border-b border-default pb-4">
          <div>
            <h2 class="text-3xl font-bold text-default">{{ group.category }}</h2>
            <p class="mt-1 text-sm text-muted">{{ group.posts.length }} article{{ group.posts.length === 1 ? '' : 's' }}</p>
          </div>
        </div>

        <div class="grid gap-8 md:grid-cols-2">
          <NuxtLink
            v-for="post in group.posts"
            :key="post.id"
            :to="getBlogPostPath(post.category, post.slug) ?? '/blog'"
            class="block"
          >
            <div class="h-full overflow-hidden rounded-xl border border-default bg-elevated shadow-sm transition-shadow hover:shadow-md">
              <div v-if="resolveMedia(post.featured_image).url" class="h-48 overflow-hidden">
                <video
                  v-if="resolveMedia(post.featured_image).isVideo"
                  :src="resolveMedia(post.featured_image).url ?? undefined"
                  autoplay
                  muted
                  loop
                  playsinline
                  class="h-full w-full object-cover"
                />
                <img
                  v-else
                  :src="resolveMedia(post.featured_image).url ?? undefined"
                  :alt="post.title"
                  class="h-full w-full object-cover"
                />
              </div>
              <div v-else class="h-48 bg-linear-to-br from-stone-50 to-stone-100 dark:from-stone-900/20 dark:to-stone-800/20" />
              <div class="p-6">
                <div class="mb-3 flex items-center gap-3">
                  <span v-if="post.category" class="rounded px-2 py-1 text-xs font-medium" :class="blogCategoryClass(post.category)">
                    {{ post.category }}
                  </span>
                  <span v-if="post.published_at" class="text-sm text-dimmed">
                    <NuxtTime :datetime="post.published_at" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
                  </span>
                </div>
                <h3 class="mb-3 text-xl font-bold text-default">{{ post.title }}</h3>
                <p v-if="post.excerpt" class="mb-4 text-muted">{{ post.excerpt }}</p>
                <span class="text-sm font-semibold" style="color: var(--kc-teal)">Read More →</span>
              </div>
            </div>
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { blogCategoryClass, getBlogPostPath } from '~/utils/blog-categories'

const { resolveMedia } = useMedia()

definePageMeta({ layout: 'blog' })

const { posts, categories } = useBlogNav()

const featuredPost = computed(() => posts.value[0] ?? null)
const featuredPostPath = computed(() => getBlogPostPath(featuredPost.value?.category, featuredPost.value?.slug))
const featuredMedia = computed(() => resolveMedia(featuredPost.value?.featured_image))

function readTime(post: ApiValue) {
  const words = (post.body ?? post.excerpt ?? '').split(/\s+/).length
  return Math.max(1, Math.ceil(words / 200))
}

usePlatformPageSeo({
  path: '/blog',
  title: 'Blog',
  description: 'Marketing tips, industry insights, and strategies to help your business succeed online.',
  breadcrumbs: [
    { name: 'Home', url: '/' },
    { name: 'Blog', url: '/blog' },
  ],
})
</script>
