<template>
  <div class="p-4 lg:p-6 max-w-4xl">
    <h1 class="text-2xl font-bold text-default capitalize mb-6">Edit {{ page }}</h1>

    <div v-if="loading" class="text-center py-12">
      <p class="text-muted">Loading...</p>
    </div>

    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6">
      <p class="text-red-600">{{ error }}</p>
    </div>

    <UCard v-else>
      <UFormField label="Page content">
        <UTextarea id="content" v-model="content" :rows="20" placeholder="Enter page content..." class="mb-4" />
      </UFormField>
      <div class="flex gap-4">
        <UButton @click="saveContent" :loading="saving">Save</UButton>
        <UButton color="neutral" variant="soft" :loading="deleting" @click="deleteContent">Delete</UButton>
        <UButton variant="outline" to="/admin?tab=content">Cancel</UButton>
      </div>
    </UCard>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const page = route.params.page

await useAuth()
const content = ref('')
const loading = ref(true)
const error = ref('')
const saving = ref(false)
const deleting = ref(false)

function validatePage(value) {
  return !!value && /^[a-zA-Z0-9_-]+$/.test(String(value))
}

onMounted(async () => {
  try {
    if (!validatePage(page)) {
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
  if (!validatePage(page)) {
    alert('Invalid page parameter')
    return
  }

  saving.value = true
  try {
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

async function deleteContent() {
  if (!validatePage(page)) {
    alert('Invalid page parameter')
    return
  }

  if (!confirm(`Delete all content for ${page}?`)) {
    return
  }

  deleting.value = true
  try {
    await $fetch(`/api/admin/content/${page}`, {
      method: 'DELETE'
    })
    content.value = ''
    alert('Content deleted successfully!')
  } catch (err) {
    console.error('Failed to delete content:', err)
    alert('Failed to delete content')
  } finally {
    deleting.value = false
  }
}
</script>
