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
        <NuxtLink :to="localePath(`/locations/${slug}`)" class="saya-kicker mb-8 inline-block text-muted no-underline hover:text-default">
          ← {{ t('saya.location.back_to', { title: location?.title }) }}
        </NuxtLink>

        <div class="flex flex-col gap-2">
          <h1 class="saya-display-md text-default">
            <em class="saya-italic">{{ t('saya.location.posts_from', { title: location?.title }) }}</em>
          </h1>
        </div>
      </header>
    </template>

    <SayaSocialPosts :posts="feed.posts.value" />
    <div v-if="feed.hasMore.value || feed.failed.value" class="flex flex-col items-center gap-3 pb-20">
      <p v-if="feed.failed.value" role="alert" class="text-sm text-error">{{ t('social_posts.load_failed') }}</p>
      <UButton v-if="feed.hasMore.value" color="neutral" variant="outline" size="lg" :loading="feed.loading.value" @click="feed.loadMore">{{ t('social_posts.load_more') }}</UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
const { localePath, t } = useI18n()

definePageMeta({ layout: 'saya' })

const route = useRoute()
const { organizationId, organization } = useTenantOrganization()
if (!organizationId) throw createError({ statusCode: 404 })

const slug = computed(() => String(route.params.slug))
const organizationName = computed(() => String((organization as ApiValue)?.name ?? '').trim())

const { location, postsFeed } = await usePublicPageData()
// A slug naming no location is a URL that does not exist. Rendering the page
// around a null location answered 200 with an empty shell — a soft 404 a
// crawler indexes. The sibling menu and product indexes already refuse it.
if (!location.value) throw createError({ statusCode: 404, statusMessage: 'Location not found' })

const feed = useSocialPostFeed(() => postsFeed.value, () => ({ locationId: location.value?.id ?? null }))

const organizationUrl = useRequestURL().origin

useSocialMetadata(() => ({
  path: `/locations/${slug.value}/posts`,
  title: `Updates · ${location.value?.title || slug.value}`,
  description: `Latest news and updates from ${location.value?.title || slug.value} at ${organizationName.value}.`,
  socialImage: location.value?.social_image ?? null,
  brand: {
    organizationName: organizationName.value,
  },
}))

useSchemaOrg([
  computed(() => ({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: organizationName.value, item: `${organizationUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Locations', item: `${organizationUrl}/locations` },
      { '@type': 'ListItem', position: 3, name: location.value?.title ?? slug.value, item: `${organizationUrl}/locations/${slug.value}` },
      { '@type': 'ListItem', position: 4, name: 'Updates', item: `${organizationUrl}/locations/${slug.value}/posts` }
    ]
  }))
])
</script>
