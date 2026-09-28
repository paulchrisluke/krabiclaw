<template>
  <NuxtLayout :name="isPlatform ? 'platform' : isBlawby ? 'blawby' : 'saya'">
    <div class="min-h-screen">
      <header v-if="!isPlatform && !isBlawby" class="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
        <h1 class="saya-display-md text-default">{{ t('saya.posts.title') }}</h1>
        <div v-if="locations.length > 1" class="mt-8 flex flex-wrap gap-3">
          <NuxtLink
            v-for="loc in locations"
            :key="loc.id"
            :to="localePath(`/locations/${loc.slug}/posts`)"
            class="inline-flex items-center gap-2 rounded-full border border-default px-5 py-2.5 text-sm text-muted no-underline transition hover:bg-muted hover:text-default"
          >
            <SayaIcon name="map-pin" class="size-3.5 opacity-70" />
            {{ loc.title }}
          </NuxtLink>
        </div>
      </header>
      <header v-else-if="isBlawby" class="bg-[var(--blawby-primary)] py-14 text-white">
        <div class="blawby-container"><h1 class="blawby-display text-4xl font-bold">{{ t('blawby.posts.title') }}</h1></div>
      </header>
      <header v-else class="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
        <h1 class="m-0 text-[clamp(32px,4vw,48px)] font-extrabold tracking-tight text-default">{{ t('social_posts.title') }}</h1>
      </header>

      <component :is="feedComponent" :posts="feed.posts.value" />
      <div v-if="feed.hasMore.value || feed.failed.value" class="flex flex-col items-center gap-3 pb-20">
        <p v-if="feed.failed.value" role="alert" class="text-sm text-error">{{ t('social_posts.load_failed') }}</p>
        <UButton v-if="feed.hasMore.value" color="neutral" variant="outline" size="lg" :loading="feed.loading.value" @click="feed.loadMore">{{ t('social_posts.load_more') }}</UButton>
      </div>
    </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import SayaSocialPosts from '~/components/saya/SayaSocialPosts.vue'
import BlawbySocialPosts from '~/components/blawby/BlawbySocialPosts.vue'
import PlatformSocialPosts from '~/components/platform/PlatformSocialPosts.vue'

definePageMeta({ layout: false })

const { organizationId, organization, isPlatform } = useTenantOrganization()
if (!organizationId) throw createError({ statusCode: 404 })
const { isBlawby } = usePublicTemplate()
const { t, localePath } = useI18n()

const { postsFeed, locations } = await usePublicPageData()
const feed = useSocialPostFeed(() => postsFeed.value, () => ({ locationId: null }))
const feedComponent = computed(() => isPlatform ? PlatformSocialPosts : isBlawby.value ? BlawbySocialPosts : SayaSocialPosts)
const organizationName = computed(() => organization?.name?.trim() ?? '')

useSocialMetadata(() => ({
  path: '/posts',
  title: `${isBlawby.value ? t('blawby.posts.title') : t('saya.posts.title')} | ${organizationName.value}`,
  description: t('saya.posts.meta_description', { organization: organizationName.value }),
  brand: { organizationName: organizationName.value },
  socialImage: organization?.social_image ?? null,
}))
</script>
