<template>
  <div class="p-4 lg:p-6">
    <div class="mb-6 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-default">Edit Post</h1>
        <p class="mt-1 text-sm text-muted">{{ post?.slug ? `/blog/${post.slug}` : 'Platform blog draft' }}</p>
      </div>
      <UButton to="/admin" color="neutral" variant="soft" icon="i-heroicons-arrow-left">Admin</UButton>
    </div>

    <UCard v-if="loadPending">
      <div class="flex items-center gap-3 text-sm text-muted">
        <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin" />
        Loading post...
      </div>
    </UCard>

    <UAlert
      v-else-if="loadError"
      color="error"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :description="loadError"
    />

    <PostEditor
      v-else
      v-model:title="form.title"
      v-model:excerpt="form.excerpt"
      v-model:category="form.category"
      v-model:body="form.body"
      eyebrow="Platform blog"
      :status-text="post?.published_at ? `Published ${formatDate(post.published_at)}` : 'Draft'"
      :published-at="post?.published_at"
      :categories="categories"
      :show-excerpt="true"
      :show-category="true"
      :show-unpublish="Boolean(post?.published_at)"
      :can-delete="true"
      :saving="saving"
      :publishing="saving"
      :error-message="errorMessage"
      :success-message="successMessage"
      markdown
      body-label="Body (Markdown)"
      body-placeholder="Write your post in Markdown..."
      :body-rows="18"
      save-label="Save changes"
      publish-label="Publish"
      @save="update(false)"
      @publish="update(true)"
      @unpublish="unpublish"
      @delete="remove"
    />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const postId = route.params.postId as string
const categories = ['Marketing', 'Technology', 'Design', 'Business', 'SEO', 'Social Media']

interface BlogPost {
  id: string
  title: string
  slug?: string | null
  excerpt?: string | null
  category?: string | null
  body: string
  published_at?: string | null
}

interface BlogPostResponse {
  post?: BlogPost
}

function getErrorMessage(error: unknown, message: string): string {
  if (error && typeof error === 'object') {
    const data = (error as Record<string, unknown>).data
    if (data && typeof data === 'object') {
      const dataError = (data as Record<string, unknown>).error
      if (typeof dataError === 'string' && dataError) return dataError
    }
    const errorMessage = (error as Record<string, unknown>).message
    if (typeof errorMessage === 'string' && errorMessage) return errorMessage
  }
  return message
}

const post = ref<BlogPost | null>(null)
const form = reactive({ title: '', excerpt: '', category: '', body: '' })
const loadPending = ref(true)
const loadError = ref('')
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

onMounted(loadPost)

async function loadPost() {
  loadPending.value = true
  loadError.value = ''
  try {
    const res = await $fetch<BlogPostResponse>(`/api/admin/blog/posts/${postId}`)
    if (!res.post) throw new Error('Post not found')
    post.value = res.post
    form.title = res.post.title
    form.excerpt = res.post.excerpt ?? ''
    form.category = res.post.category ?? ''
    form.body = res.post.body
  } catch (err) {
    loadError.value = getErrorMessage(err, 'Failed to load post.')
  } finally {
    loadPending.value = false
  }
}

async function update(publish = false) {
  if (!form.title.trim() || !form.body.trim()) {
    errorMessage.value = 'Title and body are required.'
    return
  }
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const updated = await $fetch<BlogPostResponse>(`/api/admin/blog/posts/${postId}`, {
      method: 'PATCH',
      body: { ...form, ...(publish ? { publish: true } : {}) }
    })
    if (!updated.post) throw new Error('Post not found after save')
    post.value = updated.post
    successMessage.value = publish ? 'Published.' : 'Saved.'
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Failed to save.')
  } finally {
    saving.value = false
  }
}

async function unpublish() {
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const updated = await $fetch<BlogPostResponse>(`/api/admin/blog/posts/${postId}`, { method: 'PATCH', body: { unpublish: true } })
    if (!updated.post) throw new Error('Post not found after unpublish')
    post.value = updated.post
    successMessage.value = 'Post unpublished.'
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Failed to unpublish.')
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!confirm('Delete this post permanently?')) return
  saving.value = true
  errorMessage.value = ''
  try {
    await $fetch(`/api/admin/blog/posts/${postId}`, { method: 'DELETE' })
    await navigateTo('/admin')
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Failed to delete.')
  } finally {
    saving.value = false
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

useSeoMeta({ title: 'Edit Post | Admin' })
</script>
