<template>
  <UDashboardPanel id="site-blog">
    <template #header>
      <UDashboardNavbar title="Blog Posts">
        <template #leading>
          <DashboardNavbarLeading v-if="sitePaths" :to="sitePaths.site" label="Site" />
        </template>

        <template #right>
          <UButton :to="`${baseUrl}/new`" icon="i-lucide-plus">New Post</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <p class="text-sm text-muted">Manage your site's blog content.</p>

        <UCard v-if="loadPending">
          <div class="flex items-center gap-3 text-sm text-muted">
            <UIcon name="i-lucide-refresh-cw" class="size-4 animate-spin" />
            Loading posts...
          </div>
        </UCard>

        <UAlert
          v-else-if="loadError"
          color="error"
          variant="soft"
          icon="i-lucide-triangle-alert"
          :description="loadError"
        />

        <UCard v-else-if="posts.length === 0">
          <div class="py-8 text-center">
            <p class="text-muted">No blog posts yet. Create your first post to get started.</p>
          </div>
        </UCard>

        <UCard v-else>
          <div class="space-y-3">
            <div
              v-for="post in posts"
              :key="post.id"
              class="flex items-center justify-between gap-3 border-b border-default pb-3 last:border-0 last:pb-0"
            >
              <div class="flex-1">
                <h3 class="font-medium text-default">{{ post.title }}</h3>
                <div class="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span v-if="post.status === 'published'" class="flex items-center gap-1">
                    <UIcon name="i-lucide-check-circle" class="size-3 text-green-500" />
                    Published
                  </span>
                  <span v-else class="flex items-center gap-1">
                    <UIcon name="i-lucide-clock" class="size-3" />
                    Scheduled
                  </span>
                  <span v-if="post.category">{{ post.category }}</span>
                </div>
              </div>
              <div class="flex gap-2">
                <UButton :to="`${baseUrl}/${post.id}`" color="neutral" variant="ghost" size="sm" icon="i-lucide-pencil">
                  Edit
                </UButton>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
const dashboardApi = useDashboardApi()
import { getErrorMessage } from '~/utils/errors'

interface BlogPost {
  id: string
  title: string
  slug?: string | null
  category?: string | null
  published_at?: string | null
  status: 'published' | 'scheduled'
}

definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.blog' })

const { sitePaths } = useDashboardSiteLinks()

const route = useRoute()
const siteId = await useDashboardSiteId()
const orgSlug = route.params.orgSlug as string
const siteSlug = route.params.siteSlug as string
const baseUrl = computed(() => `/dashboard/${orgSlug}/sites/${siteSlug}/blog`)

const posts = ref<BlogPost[]>([])
const loadPending = ref(true)
const loadError = ref('')

const isPostsResponse = (value: unknown): value is { posts: BlogPost[] } =>
  isRecord(value)
  && Array.isArray(value.posts)
  && value.posts.every(post =>
    isRecord(post)
    && typeof post.id === 'string'
    && typeof post.title === 'string',
  )

const requestEvent = useRequestEvent()
const { data: postsResource, pending: postsPending, error: postsError } = await useAsyncData(
  `dashboard-blog-posts:${siteId}`,
  async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      const { loadDashboardBlogPosts } = await import('~/server/utils/dashboard-editor-resources')
      return await loadDashboardBlogPosts(requestEvent, siteId)
    }
    return await dashboardApi<{ posts: BlogPost[] }>(`/api/editor/sites/${siteId}/blog/posts`, {
      validate: isPostsResponse,
    })
  },
  { lazy: import.meta.client },
)

watch([postsResource, postsPending, postsError], ([resource, pending, error]) => {
  loadPending.value = pending
  if (error) {
    loadError.value = getErrorMessage(error, 'Failed to load posts.')
    return
  }
  if (resource) {
    posts.value = resource.posts
    loadError.value = ''
  }
}, { immediate: true })

useSeoMeta({ title: 'Blog Posts | Dashboard' })
</script>
