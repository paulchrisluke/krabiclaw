<template>
  <div class="space-y-16">
    <section class="relative overflow-hidden rounded-[28px] border border-default bg-elevated px-6 py-10 sm:px-10 sm:py-14">
      <div
        class="pointer-events-none absolute inset-0 opacity-80"
        style="background:
          radial-gradient(circle at top right, color-mix(in srgb, var(--kc-coral) 14%, transparent) 0%, transparent 34%),
          radial-gradient(circle at bottom left, color-mix(in srgb, var(--kc-teal) 14%, transparent) 0%, transparent 36%);"
      />
      <div class="relative max-w-3xl space-y-6">
        <span class="inline-flex items-center rounded-full border border-default px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
          KrabiClaw Docs
        </span>
        <div class="space-y-4">
          <h1 class="text-4xl font-bold tracking-tight text-default sm:text-5xl">
            Launch and manage your local business site with KrabiClaw.
          </h1>
          <p class="max-w-2xl text-lg leading-8 text-muted">
            Set up your site, edit pages, publish updates, connect tools, and manage daily operations from ChatGPT,
            the KrabiClaw dashboard, or your live website.
          </p>
        </div>
        <div class="flex flex-wrap gap-3">
          <NuxtLink
            v-for="item in quickLinks"
            :key="item.label"
            :to="item.to"
            class="inline-flex items-center gap-2 rounded-full border border-default bg-default px-4 py-2 text-sm font-medium text-default no-underline transition hover:border-muted hover:bg-elevated"
          >
            <PlatformIcon :name="item.icon" class="size-4 text-muted" />
            {{ item.label }}
          </NuxtLink>
        </div>
      </div>
    </section>

    <section class="space-y-4">
      <div class="max-w-2xl space-y-2">
        <p class="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Start with setup</p>
        <h2 class="text-3xl font-bold tracking-tight text-default">Get your first version live.</h2>
        <p class="text-base leading-7 text-muted">
          Connect KrabiClaw to ChatGPT, create your site, choose a template, add your business details, and publish.
        </p>
      </div>

      <div v-if="pending" class="rounded-2xl border border-default bg-elevated px-6 py-10 text-center text-muted">
        Loading documentation...
      </div>

      <div v-else-if="docsError" class="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-600">
        Failed to load documentation.
      </div>

      <div v-else-if="startSetupDocs.length" class="grid gap-4 md:grid-cols-2">
        <NuxtLink
          v-for="doc in startSetupDocs"
          :key="doc.slug"
          :to="doc.path"
          class="block no-underline"
        >
          <PlatformCard hover class="h-full">
            <div class="space-y-3">
              <div class="flex items-center justify-between gap-3">
                <h3 class="text-lg font-semibold text-default">{{ doc.title }}</h3>
                <span v-if="doc.difficulty_level" class="text-xs font-medium text-muted">{{ doc.difficulty_level }}</span>
              </div>
              <p v-if="doc.excerpt" class="text-sm leading-6 text-muted">{{ doc.excerpt }}</p>
            </div>
          </PlatformCard>
        </NuxtLink>
      </div>
    </section>

    <section class="space-y-4">
      <div class="max-w-2xl space-y-2">
        <p class="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Edit and publish</p>
        <h2 class="text-3xl font-bold tracking-tight text-default">Update the parts of your site customers see.</h2>
        <p class="text-base leading-7 text-muted">
          Change pages, images, services, menus, pricing, hours, announcements, and business details without touching code.
        </p>
      </div>

      <div v-if="editDocs.length" class="grid gap-4 md:grid-cols-2">
        <NuxtLink
          v-for="doc in editDocs"
          :key="doc.slug"
          :to="doc.path"
          class="block no-underline"
        >
          <PlatformCard hover class="h-full">
            <div class="space-y-3">
              <div class="flex items-center justify-between gap-3">
                <h3 class="text-lg font-semibold text-default">{{ doc.title }}</h3>
                <span v-if="doc.difficulty_level" class="text-xs font-medium text-muted">{{ doc.difficulty_level }}</span>
              </div>
              <p v-if="doc.excerpt" class="text-sm leading-6 text-muted">{{ doc.excerpt }}</p>
            </div>
          </PlatformCard>
        </NuxtLink>
      </div>
    </section>

    <section class="space-y-4">
      <div class="max-w-2xl space-y-2">
        <p class="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Manage operations</p>
        <h2 class="text-3xl font-bold tracking-tight text-default">Run the parts of your site that support the business.</h2>
        <p class="text-base leading-7 text-muted">
          Manage contact forms, bookings, analytics, billing, integrations, and site settings from one place.
        </p>
      </div>

      <div v-if="operationsDocs.length" class="grid gap-4 md:grid-cols-2">
        <NuxtLink
          v-for="doc in operationsDocs"
          :key="doc.slug"
          :to="doc.path"
          class="block no-underline"
        >
          <PlatformCard hover class="h-full">
            <div class="space-y-3">
              <div class="flex items-center justify-between gap-3">
                <h3 class="text-lg font-semibold text-default">{{ doc.title }}</h3>
                <span v-if="doc.difficulty_level" class="text-xs font-medium text-muted">{{ doc.difficulty_level }}</span>
              </div>
              <p v-if="doc.excerpt" class="text-sm leading-6 text-muted">{{ doc.excerpt }}</p>
            </div>
          </PlatformCard>
        </NuxtLink>
      </div>
    </section>

    <section class="space-y-4">
      <div class="max-w-2xl space-y-2">
        <p class="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Explore guides</p>
        <h2 class="text-3xl font-bold tracking-tight text-default">Go deeper on setup, editing, publishing, billing, integrations, analytics, and advanced workflows.</h2>
      </div>

      <div v-if="docsWithCategorySlug.length" class="grid gap-4 md:grid-cols-2">
        <NuxtLink
          v-for="doc in docsWithCategorySlug"
          :key="doc.slug"
          :to="doc.path"
          class="block no-underline"
        >
          <PlatformCard hover class="h-full">
            <div class="space-y-3">
              <div class="flex items-center justify-between gap-3">
                <div class="space-y-1">
                  <p class="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{{ doc.category }}</p>
                  <h3 class="text-lg font-semibold text-default">{{ doc.title }}</h3>
                </div>
                <span v-if="doc.difficulty_level" class="text-xs font-medium text-muted">{{ doc.difficulty_level }}</span>
              </div>
              <p v-if="doc.excerpt" class="text-sm leading-6 text-muted">{{ doc.excerpt }}</p>
            </div>
          </PlatformCard>
        </NuxtLink>
      </div>
    </section>

    <section class="rounded-[24px] border border-default bg-elevated px-6 py-8 sm:px-8">
      <div class="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <div class="space-y-3">
          <p class="text-sm font-semibold uppercase tracking-[0.18em] text-muted">Related resources</p>
          <h2 class="text-2xl font-semibold tracking-tight text-default">Go further when you need strategy, updates, or setup help.</h2>
        </div>
        <div class="grid gap-3">
          <NuxtLink
            v-for="resource in relatedResources"
            :key="resource.title"
            :to="resource.to"
            class="flex items-start justify-between gap-4 rounded-2xl border border-default px-4 py-4 no-underline transition hover:border-muted hover:bg-default"
          >
            <div class="space-y-1">
              <p class="text-sm font-semibold text-default">{{ resource.title }}</p>
              <p class="text-sm leading-6 text-muted">{{ resource.description }}</p>
            </div>
            <PlatformIcon name="arrow-up-right" class="mt-1 size-4 shrink-0 text-muted" />
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { categoryToSlug } from '~/utils/docs-categories'

definePageMeta({ layout: 'docs' })

interface PublicDoc {
  id?: string
  title: string
  slug: string
  excerpt?: string | null
  category?: string | null
  nav_title?: string | null
  nav_order?: number | null
  hide_from_nav?: boolean | number | null
  difficulty_level?: string | null
}

interface DocsResponse {
  docs: PublicDoc[]
}

const { data, pending, error: docsError } = await useFetch<DocsResponse>('/api/public/docs', {
  default: () => ({ docs: [] })
})

if (docsError.value) {
  throw createError({ statusCode: 500, statusMessage: 'Failed to load documentation' })
}

const docs = computed<PublicDoc[]>(() => data.value?.docs ?? [])
const docsWithCategorySlug = computed(() =>
  docs.value
    .map((doc) => {
      if (doc.hide_from_nav) return null
      const categorySlug = categoryToSlug(doc.category)
      if (!categorySlug) return null
      return {
        ...doc,
        categorySlug,
        path: `/docs/${categorySlug}/${doc.slug}`,
      }
    })
    .filter((doc): doc is PublicDoc & { categorySlug: string; path: string } => Boolean(doc)),
)

const startSetupDocs = computed(() =>
  docsWithCategorySlug.value.filter(doc =>
    ['getting-started-with-krabiclaw', 'mcp-setup'].includes(doc.slug) || doc.category === 'Getting Started',
  ).slice(0, 4),
)

const editDocs = computed(() =>
  docsWithCategorySlug.value.filter(doc =>
    ['Menu Management', 'Theme Customization'].includes(doc.category || ''),
  ).slice(0, 4),
)

const operationsDocs = computed(() =>
  docsWithCategorySlug.value.filter(doc =>
    ['Integrations', 'Advanced'].includes(doc.category || ''),
  ).slice(0, 4),
)

function findDocPathBySlug(slug: string, fallback = '/docs') {
  return docsWithCategorySlug.value.find(doc => doc.slug === slug)?.path || fallback
}

function findFirstDocPathForCategories(categories: string[], fallback = '/docs') {
  return docsWithCategorySlug.value.find(doc => categories.includes(doc.category || ''))?.path || fallback
}

const quickLinks = computed(() => [
  { label: 'Start your site', to: findDocPathBySlug('getting-started-with-krabiclaw'), icon: 'zap' },
  { label: 'Edit and publish', to: findFirstDocPathForCategories(['Menu Management', 'Theme Customization'], findDocPathBySlug('mcp-setup')), icon: 'pencil' },
  { label: 'Manage operations', to: findFirstDocPathForCategories(['Integrations', 'Advanced']), icon: 'settings' },
  { label: 'Explore guides', to: '/docs', icon: 'book' },
])

const relatedResources = computed(() => [
  {
    title: 'Platform blog',
    to: '/blog',
    description: 'Product thinking, launch guidance, and strategy beyond the docs.',
  },
  {
    title: 'Pricing',
    to: '/pricing',
    description: 'See plan structure, paid tiers, and what unlocks as you grow.',
  },
  {
    title: 'ChatGPT app setup',
    to: findDocPathBySlug('mcp-setup'),
    description: 'Connect KrabiClaw in ChatGPT and start editing through conversation.',
  },
])

usePlatformPageSeo({
  path: '/docs',
  title: 'Documentation',
  description: 'Launch and manage your local business site with KrabiClaw. Set up your site, edit pages, publish updates, connect tools, and manage daily operations.',
  breadcrumbs: [
    { name: 'Home', url: '/' },
    { name: 'Documentation', url: '/docs' },
  ],
})
</script>
