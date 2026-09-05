<template>
  <UDashboardPanel id="location-posts">
    <template #header>
      <UDashboardNavbar title="Posts" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading v-if="locationPaths" :to="locationPaths.location" label="Location" />
        </template>
        <template #right>
          <UButton :to="`${postsPath}/new`" icon="i-lucide-plus" label="New post" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UTabs v-model="activeTab" :items="postTabs" :content="false" aria-label="Post status" />

        <UAlert v-if="loadError" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="loadError" />

        <div v-else-if="pending" class="space-y-2">
          <USkeleton v-for="index in 4" :key="index" class="h-16 w-full rounded-lg" />
        </div>

        <div v-else-if="!visiblePosts.length" class="rounded-lg border border-dashed border-default py-12 text-center">
          <UIcon name="i-lucide-file-text" class="mx-auto size-8 text-muted" />
          <p class="mt-3 text-sm text-muted">{{ emptyMessage }}</p>
        </div>

        <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default">
          <li v-for="post in visiblePosts" :key="String(post.id)">
            <NuxtLink
              :to="`${postsPath}/${post.id}`"
              class="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-elevated"
              :data-testid="`post-${post.id}`"
            >
              <span class="size-10 shrink-0 overflow-hidden rounded bg-muted">
                <img
                  v-if="coverUrl(post)"
                  :src="coverUrl(post)!"
                  :alt="postTitle(post)"
                  class="h-full w-full object-cover"
                >
                <span v-else class="flex h-full w-full items-center justify-center">
                  <UIcon name="i-lucide-file-text" class="size-4 text-muted" />
                </span>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold text-highlighted">{{ postTitle(post) }}</span>
                <span class="mt-1 block text-xs text-muted">{{ formatDate(String(post.updated_at ?? '')) }}</span>
              </span>
              <UBadge
                :color="post.status === 'published' ? 'success' : 'warning'"
                variant="soft"
                size="sm"
                class="shrink-0"
              >
                {{ post.status === 'published' ? 'Live' : 'Scheduled' }}
              </UBadge>
            </NuxtLink>
          </li>
        </ul>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { normalizePostMediaForForm } from '~/composables/useLocationPostEditor'
import { getErrorMessage } from '~/utils/errors'

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.posts' })

const dashboardApi = useDashboardApi()
const { locationPaths } = useDashboardSiteLinks()
const siteId = await useDashboardSiteId()
const dashboardLocation = useDashboardLocation()

const postTabs = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Live' },
  { value: 'scheduled', label: 'Scheduled' },
]
const activeTab = ref<string | number>('all')

const currentLocationId = computed(() => dashboardLocation.currentLocationId.value)
const postsPath = computed(() => locationPaths.value?.posts ?? '')

const isPostsResponse = (value: unknown): value is { posts: ApiRecord[] } =>
  isRecord(value)
  && Array.isArray(value.posts)
  && value.posts.every(post => isRecord(post) && typeof post.id === 'string' && typeof post.status === 'string')

const requestEvent = useRequestEvent()
const postsKey = computed(() => `dashboard-location-posts:${siteId}:${currentLocationId.value ?? 'missing'}`)
const { data, pending, error } = await useAsyncData(
  postsKey,
  async () => {
    if (!currentLocationId.value) throw createError({ statusCode: 404, statusMessage: 'Location not found' })
    // On the server the data is read straight from D1; going back out over HTTP
    // to our own endpoint would cost a round trip during render.
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const { loadDashboardLocationPosts } = await import('~/server/utils/dashboard-editor-resources')
      const resource = await loadDashboardLocationPosts(requestEvent, siteId, currentLocationId.value)
      return { posts: resource.posts.posts as ApiRecord[] }
    }
    const response = await dashboardApi<{ posts: ApiRecord[] }>(`/api/editor/sites/${siteId}/posts`, {
      query: { location_id: currentLocationId.value },
      validate: isPostsResponse,
    })
    return { posts: response.posts }
  },
  { lazy: import.meta.client, watch: [currentLocationId] },
)

const loadError = computed(() => (error.value ? getErrorMessage(error.value, 'Failed to load posts') : null))
const posts = computed(() => data.value?.posts ?? [])

// Filtering happens here rather than by refetching per tab: the list is already
// loaded in full, so a tab press should not cost a round trip.
const visiblePosts = computed(() => {
  if (activeTab.value === 'all') return posts.value
  return posts.value.filter(post => post.status === activeTab.value)
})

const emptyMessage = computed(() => (
  activeTab.value === 'all'
    ? 'No posts yet. Create one to share news from this location.'
    : `No ${activeTab.value === 'published' ? 'live' : 'scheduled'} posts.`
))

function postTitle(post: ApiRecord): string {
  const title = String(post.title ?? '').trim()
  if (title) return title
  const body = String(post.body ?? '').trim()
  return body ? `${body.slice(0, 60)}${body.length > 60 ? '…' : ''}` : 'Untitled post'
}

function coverUrl(post: ApiRecord): string | null {
  const media = normalizePostMediaForForm(post.media)
  const cover = media.find(item => item.slot === 'cover') ?? media[0]
  return cover?.thumbnail_url ?? cover?.public_url ?? null
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

useSeoMeta({ title: 'Posts | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
