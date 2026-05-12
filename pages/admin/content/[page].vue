<template>
  <div class="platform-theme min-h-screen bg-(--ui-bg)">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="mb-8">
        <NuxtLink to="/admin" class="text-(--ui-primary) hover:text-(--ui-primary) mb-4 inline-block">← Back to Dashboard</NuxtLink>
        <h1 class="text-3xl font-bold text-(--ui-text) capitalize">Edit {{ page }}</h1>
      </div>

      <div v-if="loading" class="text-center py-12">
        <p class="text-(--ui-text-muted)">Loading...</p>
      </div>

      <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6">
        <p class="text-red-600">{{ error }}</p>
      </div>

      <UCard v-else>
        <UTextarea v-model="content" :rows="20" placeholder="Enter page content..." class="mb-4" />
        <div class="flex gap-4">
          <UButton @click="saveContent" :loading="saving">Save</UButton>
          <UButton variant="outline" to="/admin">Cancel</UButton>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'default' })

const route = useRoute()
const page = route.params.page

const session = await useAuth()
const content = ref('')
const loading = ref(true)
const error = ref('')
const saving = ref(false)

onMounted(async () => {
  try {
    // Validate and sanitize page parameter
    if (!page || !/^[a-zA-Z0-9_-]+$/.test(page)) {
      error.value = 'Invalid page parameter'
      loading.value = false
      return
    }

    const response = await $fetch(`/api/admin/content/${page}`)
    content.value = response.content || ''
  } catch (err) {
    console.error('Failed to load content:', err)
    error.value = 'Failed to load content'
  } finally {
    loading.value = false
  }
})

async function saveContent() {
  saving.value = true
  try {
    // Validate and sanitize page parameter
    if (!page || !/^[a-zA-Z0-9_-]+$/.test(page)) {
      alert('Invalid page parameter')
      return
    }

    await $fetch(`/api/admin/content/${page}`, {
      method: 'POST',
      body: { content: content.value }
    })
    alert('Content saved successfully!')
  } catch (err) {
    console.error('Failed to save content:', err)
    alert('Failed to save content')
  } finally {
    saving.value = false
  }
}
</script>
