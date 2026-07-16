<template>
  <div class="min-h-screen bg-default text-default">

    <template v-if="location">
      <!-- Sub-nav (Level 2) -->
      <SayaSubNav
        :location-slug="slug"
        active="posts"
      />

      <!-- Compact Page header -->
      <header class="mx-auto max-w-7xl px-4 pt-12 pb-10 sm:px-6 lg:px-8 text-center">
        <NuxtLink :to="`/locations/${slug}`" class="saya-kicker mb-8 inline-block text-muted no-underline hover:text-default">
          ← {{ $t('saya.location.back_to', { title: location?.title }) }}
        </NuxtLink>

        <div class="flex flex-col gap-2">
          <h1 class="saya-display-md text-default">
            <em class="saya-italic">{{ $t('saya.location.posts_from', { title: location?.title }) }}</em>
          </h1>
        </div>
      </header>
    </template>

    <!-- Post grid -->
    <LazySayaPosts :posts="posts" :show-title="false" />

    <!-- Empty state -->
    <div
      v-if="posts.length === 0"
      class="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8"
    >
      <div class="flex flex-col items-center rounded-3xl border border-dashed border-default bg-muted/20 py-20 text-center">
        <div class="flex size-14 items-center justify-center rounded-full bg-elevated/50 text-muted shadow-sm">
          <SayaIcon name="newspaper" class="size-7" />
        </div>
        <h3 class="mt-6 saya-display saya-italic text-3xl text-default">{{ $t('saya.posts.empty_title') }}</h3>
        <p class="mt-2 max-w-sm text-sm text-muted">{{ $t('saya.posts.empty_desc') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'saya' })

const route = useRoute()
const { siteId, site } = useTenantSite()
if (!siteId) throw createError({ statusCode: 404 })

const slug = computed(() => String(route.params.slug))
const siteName = computed(() => (site as ApiValue)?.brand_name || 'KrabiClaw')

const { location, postsList, config: bootstrapConfig } = useBootstrap()
const posts = postsList

const runtimeConfig = useRuntimeConfig()
const siteUrl = runtimeConfig.public.siteUrl

useTenantSocialMetadata(() => ({
  path: `/locations/${slug.value}/posts`,
  title: `Updates · ${location.value?.title || slug.value}`,
  description: `Latest news and updates from ${location.value?.title || slug.value} at ${siteName.value}.`,
  location: location.value?.title || null,
  brand: {
    siteName: siteName.value,
    logoUrl: bootstrapConfig.value?.logo_url || null,
    faviconUrl: bootstrapConfig.value?.favicon_url || null,
    primaryColor: bootstrapConfig.value?.brand_color || null,
  },
}))

useSchemaOrg([
  computed(() => ({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName.value, item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Locations', item: `${siteUrl}/locations` },
      { '@type': 'ListItem', position: 3, name: location.value?.title ?? slug.value, item: `${siteUrl}/locations/${slug.value}` },
      { '@type': 'ListItem', position: 4, name: 'Updates', item: `${siteUrl}/locations/${slug.value}/posts` }
    ]
  }))
])
</script>
