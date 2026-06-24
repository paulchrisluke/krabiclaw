<template>
  <div class="container mx-auto px-4 py-16">
    <div class="max-w-6xl mx-auto grid lg:grid-cols-4 gap-12">
      <!-- Main Content -->
      <div class="lg:col-span-3">
        <!-- Header -->
        <div class="text-center mb-16">
          <h1 class="text-5xl font-bold text-default mb-6">Business Blog</h1>
          <p class="text-xl text-muted max-w-2xl mx-auto">
            Tips, insights, and stories to help your business thrive in the digital age.
          </p>
        </div>

        <div v-if="pending" class="space-y-8">
          <div v-for="i in 3" :key="i" class="bg-elevated rounded-2xl h-64 animate-pulse" />
        </div>

        <div v-else-if="posts.length === 0" class="text-center py-24 text-muted">
          <p class="text-xl mb-2">No posts yet</p>
          <p class="text-sm">Check back soon — new content is on the way.</p>
        </div>

        <div v-else>
          <!-- Featured Post -->
          <NuxtLink :to="`/blog/${posts[0].slug}`" class="block mb-12">
            <div class="bg-elevated rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
                  <div v-if="resolveMedia(posts[0].featured_image).url" class="h-64 overflow-hidden">
                    <video
                      v-if="resolveMedia(posts[0].featured_image).isVideo"
                      :src="resolveMedia(posts[0].featured_image).url ?? undefined"
                  autoplay
                  muted
                  loop
                  playsinline
                  class="h-full w-full object-cover"
                />
                    <img
                      v-else
                      :src="resolveMedia(posts[0].featured_image).url ?? undefined"
                  :alt="posts[0].title"
                  class="h-full w-full object-cover"
                />
              </div>
              <div v-else class="h-64 bg-linear-to-br from-teal-50 to-teal-100 dark:from-teal-900/20 dark:to-teal-800/20" />
              <div class="p-8">
                <div class="flex items-center gap-4 mb-4">
                  <span class="bg-inverted text-inverted px-3 py-1 rounded-full text-sm font-medium">Featured</span>
                  <span v-if="posts[0].category" class="px-3 py-1 rounded-full text-sm font-medium" :class="categoryClass(posts[0].category)">{{ posts[0].category }}</span>
                  <span v-if="posts[0].published_at" class="text-dimmed text-sm">
                    <NuxtTime :datetime="posts[0].published_at" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
                  </span>
                </div>
                <h2 class="text-3xl font-bold text-default mb-4">{{ posts[0].title }}</h2>
                <p v-if="posts[0].excerpt" class="text-muted mb-6 text-lg">{{ posts[0].excerpt }}</p>
                <div class="flex items-center justify-between">
                  <p class="text-sm text-dimmed">{{ readTime(posts[0]) }} min read</p>
                  <span class="font-semibold text-sm" style="color: var(--kc-teal)">Read Article →</span>
                </div>
              </div>
            </div>
          </NuxtLink>

          <!-- Recent Posts -->
          <div v-if="posts.length > 1" class="mb-12">
            <h2 class="text-3xl font-bold text-default mb-8">Recent Posts</h2>
            <div class="grid md:grid-cols-2 gap-8">
              <NuxtLink
                v-for="post in posts.slice(1)"
                :key="post.id"
                :to="`/blog/${post.slug}`"
                class="block"
              >
                <div class="bg-elevated rounded-xl shadow-sm border border-default overflow-hidden hover:shadow-md transition-shadow h-full">
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
                    <div class="flex items-center gap-3 mb-3">
                      <span v-if="post.category" class="px-2 py-1 rounded text-xs font-medium" :class="categoryClass(post.category)">{{ post.category }}</span>
                      <span v-if="post.published_at" class="text-dimmed text-sm">
                        <NuxtTime :datetime="post.published_at" locale="en-US" year="numeric" month="long" day="numeric" time-zone="UTC" />
                      </span>
                    </div>
                    <h3 class="text-xl font-bold text-default mb-3">{{ post.title }}</h3>
                    <p v-if="post.excerpt" class="text-muted mb-4">{{ post.excerpt }}</p>
                    <span class="font-semibold text-sm" style="color: var(--kc-teal)">Read More →</span>
                  </div>
                </div>
              </NuxtLink>
            </div>
          </div>
        </div>

        <!-- Newsletter Signup -->
        <div class="bg-inverted text-inverted rounded-2xl p-8 text-center">
          <h2 class="text-3xl font-bold mb-4">Stay Updated</h2>
          <p class="text-inverted/70 mb-6 max-w-2xl mx-auto">
            Get the latest marketing tips and industry insights delivered to your inbox.
          </p>
          <form @submit.prevent="handleNewsletterSubmit" class="flex flex-col sm:flex-row gap-4 max-w-md mx-auto items-center justify-center">
            <input
              id="newsletter-email"
              v-model="newsletterEmail"
              type="email"
              placeholder="Enter your email"
              class="flex-1 px-4 py-3 rounded-lg text-default bg-white"
              aria-label="Enter your email for the newsletter"
            >
            <UButton type="submit" color="neutral" variant="outline" :loading="subscribing">Subscribe</UButton>
          </form>
          <p v-if="subscribeMessage" class="mt-4 text-sm text-inverted/80">{{ subscribeMessage }}</p>
        </div>
      </div>

      <!-- Sidebar -->
      <div class="lg:col-span-1">
        <div class="sticky top-8">
          <h2 class="text-2xl font-bold text-default mb-6">Browse by Category</h2>
          <div class="flex flex-col gap-3">
            <UButton
              v-for="cat in categories"
              :key="cat"
              :variant="activeCategory === cat ? 'solid' : 'outline'"
              color="neutral"
              class="w-full justify-start"
              @click="toggleCategory(cat)"
            >{{ cat }}</UButton>
          </div>
          <UButton v-if="activeCategory" variant="ghost" color="neutral" class="w-full mt-3" @click="activeCategory = null">
            Clear filter
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { resolveMedia } = useMedia()
definePageMeta({ layout: 'platform' })

const CATEGORY_CLASSES: Record<string, string> = {
  Marketing: 'bg-amber-100 text-amber-800',
  Technology: 'bg-emerald-100 text-emerald-800',
  Design: 'bg-indigo-100 text-indigo-800',
  Business: 'bg-rose-100 text-rose-800',
  SEO: 'bg-violet-100 text-violet-800',
  'Social Media': 'bg-sky-100 text-sky-800',
}

const categories = Object.keys(CATEGORY_CLASSES)
const activeCategory = ref<string | null>(null)
const newsletterEmail = ref('')
const subscribing = ref(false)
const subscribeMessage = ref('')

const apiUrl = computed(() =>
  activeCategory.value
    ? `/api/public/blog/posts?category=${encodeURIComponent(activeCategory.value)}`
    : '/api/public/blog/posts'
)

const { data, pending } = useAsyncData(
  () => `blog-${activeCategory.value ?? 'all'}`,
  () => $fetch<ApiValue>(apiUrl.value as string),
  { watch: [activeCategory] }
)

const posts = computed(() => (data.value as ApiValue)?.posts ?? [])

function toggleCategory(cat: string) {
  activeCategory.value = activeCategory.value === cat ? null : cat
}

function categoryClass(cat: string) {
  return CATEGORY_CLASSES[cat] ?? 'bg-stone-100 text-stone-800'
}

function readTime(post: ApiValue) {
  const words = (post.body ?? post.excerpt ?? '').split(/\s+/).length
  return Math.max(1, Math.ceil(words / 200))
}

async function handleNewsletterSubmit() {
  if (!newsletterEmail.value.trim()) return
  subscribing.value = true
  subscribeMessage.value = ''
  try {
    await $fetch('/api/contact', {
      method: 'POST',
      body: { email: newsletterEmail.value, type: 'newsletter' }
    })
    subscribeMessage.value = "You're subscribed! We'll be in touch."
    newsletterEmail.value = ''
  } catch {
    subscribeMessage.value = 'Something went wrong. Please try again.'
  } finally {
    subscribing.value = false
  }
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
