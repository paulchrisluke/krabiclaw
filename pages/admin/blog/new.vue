<template>
  <div class="min-h-screen bg-(--ui-bg)">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-8 flex items-center gap-4">
        <NuxtLink to="/admin" class="text-(--ui-text-muted) hover:text-(--ui-text) transition-colors">← Admin</NuxtLink>
        <h1 class="text-2xl font-bold text-(--ui-text)">New Blog Post</h1>
      </div>

      <UCard>
        <div class="space-y-6">
          <div>
            <label class="block text-sm font-medium text-(--ui-text) mb-2">Title <span class="text-red-500">*</span></label>
            <UInput v-model="form.title" placeholder="How to..." size="lg" />
          </div>

          <div>
            <label class="block text-sm font-medium text-(--ui-text) mb-2">Excerpt</label>
            <UTextarea v-model="form.excerpt" placeholder="One or two sentences summarising the post..." :rows="2" />
          </div>

          <div>
            <label class="block text-sm font-medium text-(--ui-text) mb-2">Category</label>
            <USelect v-model="form.category" :options="categories" placeholder="Select a category" />
          </div>

          <div>
            <label class="block text-sm font-medium text-(--ui-text) mb-2">Body (Markdown) <span class="text-red-500">*</span></label>
            <UTextarea v-model="form.body" placeholder="Write your post in Markdown..." :rows="20" class="font-mono text-sm" />
          </div>

          <p v-if="errorMessage" class="text-red-600 text-sm">{{ errorMessage }}</p>

          <div class="flex gap-3 pt-2">
            <UButton @click="save(false)" :loading="saving" variant="outline" color="neutral">Save Draft</UButton>
            <UButton @click="save(true)" :loading="saving" color="primary">Publish</UButton>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
interface CreatePostResponse {
  id: string | number
  [key: string]: unknown
}

definePageMeta({ layout: 'default' })

const categories = ['Marketing', 'Technology', 'Design', 'Business', 'SEO', 'Social Media']

const form = reactive({ title: '', excerpt: '', category: '', body: '' })
const saving = ref(false)
const errorMessage = ref('')

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
  } catch (err: any) {
    errorMessage.value = err?.data?.error ?? 'Failed to save post.'
  } finally {
    saving.value = false
  }
}

useSeoMeta({ title: 'New Post | Admin' })
</script>
