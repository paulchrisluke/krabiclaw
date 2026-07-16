<template>
  <div class="p-4 lg:p-6">
    <div class="mb-6 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-default">Blog Posts</h1>
        <p class="mt-1 text-sm text-muted">Manage your site's blog content.</p>
      </div>
      <UButton :to="`${baseUrl}/new`" icon="i-lucide-plus">New Post</UButton>
    </div>

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
              <span v-if="post.published_at" class="flex items-center gap-1">
                <UIcon name="i-lucide-check-circle" class="size-3 text-green-500" />
                Published
              </span>
              <span v-else class="flex items-center gap-1">
                <UIcon name="i-lucide-file-text" class="size-3" />
                Draft
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

<script setup lang="ts">
import { getErrorMessage } from '~/utils/errors'

interface BlogPost {
  id: string
  title: string
  slug?: string | null
  category?: string | null
  published_at?: string | null
}

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const siteId = await useDashboardSiteId()
const orgSlug = route.params.orgSlug as string
const siteSlug = route.params.siteSlug as string
const baseUrl = computed(() => `/dashboard/${orgSlug}/sites/${siteSlug}/blog`)

const posts = ref<BlogPost[]>([])
const loadPending = ref(true)
const loadError = ref('')

async function loadPosts() {
  loadPending.value = true
  loadError.value = ''
  try {
    const res = await $fetch<{ posts: BlogPost[] }>(`/api/editor/sites/${siteId}/blog/posts`)
    posts.value = res.posts || []
  } catch (err) {
    loadError.value = getErrorMessage(err, 'Failed to load posts.')
  } finally {
    loadPending.value = false
  }
}

onMounted(() => {
  loadPosts()
})

useSeoMeta({ title: 'Blog Posts | Dashboard' })
</script>
