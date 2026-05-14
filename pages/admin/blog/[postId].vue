<template>
  <div class="min-h-screen bg-default">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-8 flex items-center gap-4">
        <NuxtLink to="/admin" class="text-muted hover:text-default transition-colors">← Admin</NuxtLink>
        <h1 class="text-2xl font-bold text-default">Edit Post</h1>
        <span v-if="post?.published_at" class="ml-auto text-sm text-green-600 font-medium">Published {{ formatDate(post.published_at) }}</span>
        <span v-else class="ml-auto text-sm text-dimmed font-medium">Draft</span>
      </div>

      <div v-if="loadPending" class="text-center py-12 text-muted">Loading…</div>
      <div v-else-if="loadError" class="bg-red-50 border border-red-200 rounded-lg p-6 text-red-600">{{ loadError }}</div>

      <UCard v-else>
        <div class="space-y-6">
          <div>
            <label class="block text-sm font-medium text-default mb-2">Title <span class="text-red-500">*</span></label>
            <UInput v-model="form.title" size="lg" />
          </div>

          <div>
            <label class="block text-sm font-medium text-default mb-2">Excerpt</label>
            <UTextarea v-model="form.excerpt" :rows="2" />
          </div>

          <div>
            <label class="block text-sm font-medium text-default mb-2">Category</label>
            <USelect v-model="form.category" :options="categories" placeholder="Select a category" />
          </div>

          <div>
            <label class="block text-sm font-medium text-default mb-2">Body (Markdown) <span class="text-red-500">*</span></label>
            <UTextarea v-model="form.body" :rows="20" class="font-mono text-sm" />
          </div>

          <p v-if="errorMessage" class="text-red-600 text-sm">{{ errorMessage }}</p>
          <p v-if="successMessage" class="text-green-600 text-sm">{{ successMessage }}</p>

          <div class="flex gap-3 pt-2">
            <UButton @click="update()" :loading="saving" variant="outline" color="neutral">Save Changes</UButton>
            <UButton v-if="!post?.published_at" @click="update(true)" :loading="saving" color="primary">Publish</UButton>
            <UButton v-else @click="unpublish()" :loading="saving" variant="outline" color="neutral">Unpublish</UButton>
            <UButton @click="remove()" :loading="deleting" variant="outline" color="error" class="ml-auto">Delete</UButton>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'default' })

const route = useRoute()
const postId = route.params.postId as string
const categories = ['Marketing', 'Technology', 'Design', 'Business', 'SEO', 'Social Media']

interface BlogPost {
  title: string
  excerpt?: string | null
  category?: string | null
  body: string
  published_at?: string | null
}

interface BlogPostResponse {
  post?: BlogPost
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const data = (error as Record<string, unknown>).data
    if (data && typeof data === 'object') {
      const dataError = (data as Record<string, unknown>).error
      if (typeof dataError === 'string' && dataError) return dataError
    }
    const message = (error as Record<string, unknown>).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

const post = ref<BlogPost | null>(null)
const form = reactive({ title: '', excerpt: '', category: '', body: '' })
const loadPending = ref(true)
const loadError = ref('')
const saving = ref(false)
const deleting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

onMounted(async () => {
  try {
    const res = await $fetch<BlogPostResponse>(`/api/admin/blog/posts/${postId}`)
    if (!res?.post) {
      loadError.value = 'Failed to load post: unexpected response from server.'
      console.error('Unexpected API response loading post', postId, res)
      return
    }
    post.value = res.post
    form.title = res.post.title
    form.excerpt = res.post.excerpt ?? ''
    form.category = res.post.category ?? ''
    form.body = res.post.body
  } catch (err) {
    loadError.value = `Failed to load post: ${getErrorMessage(err, 'Unknown error')}`
    console.error('Error loading post', postId, err)
  } finally {
    loadPending.value = false
  }
})

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
    if (updated?.post) {
      post.value = updated.post
    } else if (publish) {
      // fallback: re-fetch if server didn't return the updated post
      const refetched = await $fetch<BlogPostResponse>(`/api/admin/blog/posts/${postId}`)
      if (refetched?.post) post.value = refetched.post
    }
    successMessage.value = 'Saved.'
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Failed to save.')
  } finally {
    saving.value = false
  }
}

async function unpublish() {
  saving.value = true
  errorMessage.value = ''
  try {
    await $fetch(`/api/admin/blog/posts/${postId}`, { method: 'PATCH', body: { unpublish: true } })
    if (post.value) post.value.published_at = null
    successMessage.value = 'Post unpublished.'
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Failed to unpublish.')
  } finally {
    saving.value = false
  }
}

async function remove() {
  if (!confirm('Delete this post permanently?')) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/blog/posts/${postId}`, { method: 'DELETE' })
    await navigateTo('/admin')
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Failed to delete.')
    deleting.value = false
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

useSeoMeta({ title: 'Edit Post | Admin' })
</script>
