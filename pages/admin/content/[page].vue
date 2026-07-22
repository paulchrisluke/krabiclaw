<template>
  <UDashboardPanel id="admin-content-page">
    <template #header>
      <UDashboardNavbar :title="`Edit ${page}`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <UButton to="/admin/content" color="neutral" variant="soft" icon="i-lucide-arrow-left" size="sm">Content</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="loading" class="text-center py-12">
        <p class="text-muted">Loading...</p>
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :description="error"
      />

      <UCard v-else>
        <div class="space-y-4">
          <UFormField label="Page content">
            <UTextarea id="content" v-model="content" :rows="20" placeholder="Enter page content..." />
          </UFormField>
          <div class="flex gap-3 border-t border-default pt-4">
            <UButton :loading="saving" @click="saveContent">Save</UButton>
            <UButton color="error" variant="ghost" :loading="deleting" @click="deleteConfirmOpen = true">Delete</UButton>
            <UButton variant="ghost" color="neutral" to="/admin/content">Cancel</UButton>
          </div>
        </div>
      </UCard>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="deleteConfirmOpen" :ui="{ content: 'max-w-md' }">
    <template #content>
      <div class="p-6">
        <h3 class="text-lg font-semibold text-default mb-2">Delete content?</h3>
        <p class="text-sm text-muted mb-6">Delete all content for <strong>{{ page }}</strong>? This cannot be undone.</p>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deleteConfirmOpen = false">Cancel</UButton>
          <UButton color="error" :loading="deleting" @click="confirmDelete">Delete</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'admin' })

const route = useRoute()
const toast = useToast()
const page = route.params.page as string

const content = ref('')
const loading = ref(true)
const error = ref('')
const saving = ref(false)
const deleting = ref(false)
const deleteConfirmOpen = ref(false)

function validatePage(value: string) {
  return ALLOWED_PLATFORM_CONTENT_PAGES.includes(value)
}

onMounted(async () => {
  try {
    if (!validatePage(page)) {
      error.value = 'Invalid page parameter'
      loading.value = false
      return
    }
    const response = await $fetch<{ content?: string }>(`/api/admin/content/${page}`)
    content.value = response.content ?? ''
  } catch (err) {
    console.error('Failed to load content:', err)
    error.value = 'Failed to load content'
  } finally {
    loading.value = false
  }
})

async function saveContent() {
  if (!validatePage(page)) {
    toast.add({ title: 'Invalid page parameter', color: 'error' })
    return
  }
  saving.value = true
  try {
    await $fetch(`/api/admin/content/${page}`, {
      method: 'POST',
      body: { content: content.value },
    })
    toast.add({ title: 'Content saved', color: 'success' })
  } catch (err) {
    console.error('Failed to save content:', err)
    toast.add({ title: 'Failed to save content', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (!validatePage(page)) {
    toast.add({ title: 'Invalid page parameter', color: 'error' })
    return
  }
  deleting.value = true
  try {
    await $fetch(`/api/admin/content/${page}`, { method: 'DELETE' })
    content.value = ''
    deleteConfirmOpen.value = false
    toast.add({ title: 'Content deleted', color: 'success' })
  } catch (err) {
    console.error('Failed to delete content:', err)
    toast.add({ title: 'Failed to delete content', color: 'error' })
  } finally {
    deleting.value = false
  }
}

useSeoMeta({ title: `Edit ${page} | Admin`, robots: 'noindex, nofollow' })
</script>
