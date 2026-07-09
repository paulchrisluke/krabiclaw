<template>
  <section class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
    <p class="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--blawby-accent-strong)]">Articles</p>
    <h1 class="mt-4 blawby-display text-5xl text-[var(--blawby-primary)]">Articles and updates</h1>

    <div v-if="posts.length" class="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <NuxtLink v-for="post in posts" :key="post.id" :to="`/article/${post.slug}`" class="block border border-[var(--blawby-border)] bg-white no-underline transition hover:border-[var(--blawby-accent)]">
        <img v-if="resolveMedia(post.featured_image).url" :src="resolveMedia(post.featured_image).url ?? undefined" :alt="post.title" class="aspect-[4/3] w-full object-cover">
        <div class="p-6">
          <p v-if="post.category" class="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--blawby-accent-strong)]">{{ post.category }}</p>
          <h2 class="mt-3 blawby-display text-3xl text-[var(--blawby-primary)]">{{ post.title }}</h2>
          <p v-if="post.excerpt" class="mt-3 text-sm leading-7 text-slate-600">{{ post.excerpt }}</p>
        </div>
      </NuxtLink>
    </div>
    <p v-else class="mt-12 border border-[var(--blawby-border)] bg-white p-8 text-slate-600">Articles will appear here once they are published.</p>
  </section>
</template>

<script setup lang="ts">
interface TenantBlogPost {
  id: string
  slug: string
  title: string
  excerpt?: string | null
  category?: string | null
  featured_image?: { public_url: string | null; kind: string | null } | null
}

const { site } = useTenantSite()
const { blogList } = useBootstrap()
const { resolveMedia } = useMedia()
const posts = computed(() => (blogList.value ?? []) as unknown as TenantBlogPost[])

useSeoMeta({
  title: computed(() => `Articles | ${site?.brand_name || 'Professional services'}`),
  description: 'Articles, updates, and public information.',
})
</script>
