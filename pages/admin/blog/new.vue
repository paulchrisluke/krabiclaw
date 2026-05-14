<template>
  <div class="p-4 lg:p-6">
    <div class="mb-6 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-default">New Blog Post</h1>
        <p class="mt-1 text-sm text-muted">Draft and publish platform blog content.</p>
      </div>
      <UButton to="/admin" color="neutral" variant="soft" icon="i-heroicons-arrow-left">Admin</UButton>
    </div>

    <PostEditor
      v-model:title="form.title"
      v-model:excerpt="form.excerpt"
      v-model:category="form.category"
      v-model:body="form.body"
      eyebrow="Platform blog"
      status-text="Draft"
      :categories="categories"
      :show-excerpt="true"
      :show-category="true"
      :saving="saving"
      :publishing="saving"
      :error-message="errorMessage"
      markdown
      body-label="Body (Markdown)"
      body-placeholder="Write your post in Markdown..."
      :body-rows="18"
      save-label="Save draft"
      publish-label="Publish"
      @save="save(false)"
      @publish="save(true)"
    />
  </div>
</template>

<script setup lang="ts">
interface CreatePostResponse {
  id: string | number
  [key: string]: ApiValue
}

definePageMeta({ layout: 'dashboard' })

const categories = ['Marketing', 'Technology', 'Design', 'Business', 'SEO', 'Social Media']

const form = reactive({ title: '', excerpt: '', category: '', body: '' })
const saving = ref(false)
const errorMessage = ref('')

function getErrorMessage(error: unknown, message: string): string {
  if (error && typeof error === 'object') {
    const data = (error as Record<string, unknown>).data
    if (data && typeof data === 'object') {
      const dataError = (data as Record<string, unknown>).error
      if (typeof dataError === 'string' && dataError) return dataError
    }
  }
  return message
}

async function save(publish: boolean) {
  if (!form.title.trim() || !form.body.trim()) {
    errorMessage.value = 'Title and body are required.'
    return
  }
  saving.value = true
  errorMessage.value = ''
  try {
    const res = await $fetch<CreatePostResponse>('/api/admin/blog/posts', {
      method: 'POST',
      body: { ...form, publish }
    })
    await navigateTo(`/admin/blog/${res.id}`)
  } catch (err) {
    errorMessage.value = getErrorMessage(err, 'Failed to save post.')
  } finally {
    saving.value = false
  }
}

useSeoMeta({ title: 'New Post | Admin' })
</script>
