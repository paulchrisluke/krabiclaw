<template>
  <UPage>
    <UPageBody>
      <div class="grid gap-6 lg:grid-cols-[360px_1fr]">
        <!-- Left: post list -->
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <h1 class="text-lg font-semibold text-default">Blog</h1>
            <UButton size="sm" icon="i-heroicons-plus" @click="openCompose">New post</UButton>
          </div>

          <div class="overflow-hidden rounded-lg border border-default">
            <div class="flex items-center gap-3 border-b border-default bg-elevated px-4 py-2.5">
              <button
                v-for="tab in ['all', 'published', 'draft']"
                :key="tab"
                class="text-xs font-semibold capitalize transition-colors"
                :class="activeTab === tab ? 'text-highlighted' : 'text-muted hover:text-default'"
                @click="activeTab = tab; loadPosts()"
              >{{ tab }}</button>
            </div>

            <div v-if="!loading && posts.length === 0" class="px-4 py-10 text-center">
              <UIcon name="i-heroicons-newspaper" class="mx-auto size-8 text-muted" />
              <p class="mt-3 text-sm text-muted">No posts yet. Write your first one.</p>
            </div>

            <div
              v-for="item in posts"
              :key="item.id"
              class="flex cursor-pointer items-start gap-3 border-b border-default px-4 py-3.5 last:border-0 hover:bg-elevated"
              :class="selectedPostId === item.id ? 'bg-elevated' : ''"
              @click="selectPost(item.id)"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-highlighted">{{ item.title }}</p>
                <p class="truncate text-xs text-muted">{{ formatDate(item.updated_at) }}</p>
              </div>
              <UBadge :color="item.published ? 'success' : 'warning'" variant="soft" size="xs" class="shrink-0">
                {{ item.published ? 'published' : 'draft' }}
              </UBadge>
            </div>
          </div>
        </div>

        <!-- Right: editor -->
        <UCard v-if="selectedPostId || composing">
          <div class="space-y-4">
            <UFormField label="Title">
              <UInput v-model="form.title" placeholder="Our new summer menu" size="lg" />
            </UFormField>

            <UFormField label="Category" hint="Optional — free text, e.g. 'News', 'Recipes'">
              <UInput v-model="form.category" placeholder="News" />
            </UFormField>

            <UFormField label="Excerpt">
              <UTextarea v-model="form.excerpt" :rows="3" placeholder="One or two sentences that summarize this post." />
            </UFormField>

            <UFormField label="SEO Description">
              <UTextarea v-model="form.seo_description" :rows="2" placeholder="Meta description for search engines (150-160 characters recommended)" />
            </UFormField>

            <UFormField label="SEO Keywords">
              <UInput v-model="form.seo_keywords" placeholder="local restaurant, weekend specials" />
            </UFormField>

            <UFormField label="Body (Markdown)">
              <UTextarea v-model="form.body" :rows="14" placeholder="Write your post in Markdown..." class="font-mono text-sm" />
            </UFormField>

            <UFormField label="Featured Image">
              <MediaPicker v-model="form.featured_image_asset_id" :site-id="siteId" />
            </UFormField>

            <div v-if="errorMessage || successMessage" class="space-y-2">
              <UAlert v-if="errorMessage" color="error" variant="soft" icon="i-heroicons-exclamation-triangle" :description="errorMessage" />
              <UAlert v-if="successMessage" color="success" variant="soft" icon="i-heroicons-check-circle" :description="successMessage" />
            </div>

            <div class="flex flex-wrap items-center gap-2 border-t border-default pt-4">
              <UButton color="neutral" variant="soft" :loading="saving" :disabled="!canSave" @click="save(false)">
                Save changes
              </UButton>
              <UButton :loading="saving" :disabled="!canPublish" @click="save(true)">
                Publish
              </UButton>
              <UButton v-if="selectedPublished" color="neutral" variant="ghost" :loading="saving" @click="unpublish">
                Unpublish
              </UButton>
              <UButton v-if="selectedPostId" color="error" variant="ghost" :loading="saving" @click="remove">
                Delete
              </UButton>
              <UButton color="neutral" variant="ghost" @click="closeEditor">Close</UButton>
            </div>
          </div>
        </UCard>

        <div v-else class="hidden lg:flex items-center justify-center rounded-lg border border-dashed border-default text-sm text-muted">
          Select a post or write a new one
        </div>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import { useBlogForm } from '~/composables/useBlogForm'

interface DashboardBlogPost {
  id: string
  title: string
  published: boolean
  updated_at: string
}

definePageMeta({ layout: 'dashboard' })

const siteId = await useDashboardSiteId()
const toast = useToast()

const posts = ref<DashboardBlogPost[]>([])
const loading = ref(false)
const activeTab = ref('all')

const loadPosts = async () => {
  loading.value = true
  try {
    const query: Record<string, string> = {}
    if (activeTab.value !== 'all') query.status = activeTab.value
    const res = await $fetch<{ posts: DashboardBlogPost[] }>(`/api/editor/sites/${siteId}/blog/posts`, { query })
    posts.value = res.posts ?? []
  } catch {
    toast.add({ description: 'Failed to load posts', color: 'error' })
  } finally {
    loading.value = false
  }
}

onMounted(loadPosts)

const { form, canSave, canPublish } = useBlogForm()
const selectedPostId = ref<string | null>(null)
const composing = ref(false)
const selectedPublished = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

function resetForm() {
  form.title = ''
  form.excerpt = ''
  form.category = ''
  form.seo_description = ''
  form.seo_keywords = ''
  form.canonical_url = ''
  form.robots = ''
  form.featured_image_asset_id = ''
  form.body = ''
}

function openCompose() {
  selectedPostId.value = null
  composing.value = true
  selectedPublished.value = false
  resetForm()
}

function closeEditor() {
  selectedPostId.value = null
  composing.value = false
  resetForm()
}

async function selectPost(postId: string) {
  composing.value = false
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const res = await $fetch<{ post: ApiRecord }>(`/api/editor/sites/${siteId}/blog/posts/${postId}`)
    const post = res.post
    selectedPostId.value = post.id as string
    selectedPublished.value = Boolean(post.published)
    form.title = (post.title as string) ?? ''
    form.excerpt = (post.excerpt as string) ?? ''
    form.category = (post.category as string) ?? ''
    form.seo_description = (post.seo_description as string) ?? ''
    form.seo_keywords = (post.seo_keywords as string) ?? ''
    form.canonical_url = (post.canonical_url as string) ?? ''
    form.robots = (post.robots as string) ?? ''
    form.featured_image_asset_id = (post.featured_image_asset_id as string) ?? ''
    form.body = (post.body as string) ?? ''
  } catch {
    toast.add({ description: 'Failed to load post', color: 'error' })
  }
}

function buildPayload() {
  return {
    title: form.title,
    body: form.body,
    excerpt: form.excerpt || null,
    category: form.category || null,
    seo_description: form.seo_description || null,
    seo_keywords: form.seo_keywords || null,
    canonical_url: form.canonical_url.trim() || null,
    robots: form.robots.trim() || null,
    featured_image_asset_id: form.featured_image_asset_id || null,
  }
}

async function save(publish = false) {
  if (!form.title.trim() || !form.body.trim()) {
    errorMessage.value = 'Title and body are required.'
    return
  }
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    if (selectedPostId.value) {
      const res = await $fetch<{ post: ApiRecord }>(`/api/editor/sites/${siteId}/blog/posts/${selectedPostId.value}`, {
        method: 'PATCH',
        body: { ...buildPayload(), ...(publish ? { publish: true } : {}) },
      })
      selectedPublished.value = Boolean(res.post.published)
    } else {
      const res = await $fetch<{ id: string; post: ApiRecord }>(`/api/editor/sites/${siteId}/blog/posts`, {
        method: 'POST',
        body: { ...buildPayload(), publish },
      })
      selectedPostId.value = res.id
      selectedPublished.value = Boolean(res.post?.published)
      composing.value = false
    }
    successMessage.value = publish ? 'Published.' : 'Saved.'
    await loadPosts()
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Failed to save.')
  } finally {
    saving.value = false
  }
}

async function unpublish() {
  if (!selectedPostId.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const res = await $fetch<{ post: ApiRecord }>(`/api/editor/sites/${siteId}/blog/posts/${selectedPostId.value}`, {
      method: 'PATCH',
      body: { unpublish: true },
    })
    selectedPublished.value = Boolean(res.post.published)
    successMessage.value = 'Unpublished.'
    await loadPosts()
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Failed to unpublish.')
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!selectedPostId.value) return
  if (!confirm('Delete this post permanently?')) return
  saving.value = true
  try {
    await $fetch(`/api/editor/sites/${siteId}/blog/posts/${selectedPostId.value}`, { method: 'DELETE' })
    closeEditor()
    toast.add({ description: 'Post deleted', color: 'neutral' })
    await loadPosts()
  } catch {
    toast.add({ description: 'Failed to delete', color: 'error' })
  } finally {
    saving.value = false
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const data = (error as Record<string, unknown>).data
    if (data && typeof data === 'object') {
      const message = (data as Record<string, unknown>).error
      if (typeof message === 'string' && message) return message
    }
  }
  return fallback
}

function formatDate(iso: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

useSeoMeta({ title: 'Blog | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
