<template>
  <UDashboardPanel id="admin-docs">
    <template #header>
      <UDashboardNavbar title="Docs">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <UButton size="sm" to="/admin/docs/new">New doc</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <div v-if="docsError" class="text-sm text-error">{{ docsError }}</div>
        <div v-else-if="docs.length === 0" class="text-sm text-muted py-4">No docs yet.</div>
        <div v-else class="divide-y divide-default rounded-xl border border-default overflow-hidden">
          <div v-for="doc in docs" :key="doc.id" class="flex items-center justify-between px-5 py-4">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <p class="font-medium text-default truncate">{{ doc.title }}</p>
                <UBadge :color="doc.status === 'published' ? 'success' : 'neutral'" variant="soft" size="xs">{{ doc.status }}</UBadge>
              </div>
              <p class="text-xs text-muted truncate">{{ doc.category }}<template v-if="doc.slug"> · {{ doc.slug }}</template></p>
            </div>
            <div class="flex gap-2 shrink-0">
              <UButton size="xs" variant="outline" :to="`/admin/docs/${doc.id}`">Edit</UButton>
              <UButton size="xs" variant="outline" color="error" :loading="deletingDocId === doc.id" @click="openDeleteConfirm(doc.id)">Delete</UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Delete doc confirm modal -->
  <UModal v-model:open="deleteConfirmOpen" :ui="{ content: 'max-w-md' }">
    <template #content>
      <div class="p-6">
        <h3 class="text-lg font-semibold text-default mb-2">Delete doc?</h3>
        <p class="text-sm text-muted mb-6">This action cannot be undone.</p>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deleteConfirmOpen = false">Cancel</UButton>
          <UButton color="error" :loading="deletingDocId !== null" @click="confirmDeleteDoc">Delete</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: 'admin' })
useSeoMeta({ title: 'Docs | KrabiClaw Admin', robots: 'noindex, nofollow' })

const toast = useToast()

interface Doc { id: string; title: string; slug: string | null; category: string | null; status: string }

const docs = ref<Doc[]>([])
const docsError = ref('')
const deleteConfirmOpen = ref(false)
const pendingDeleteDocId = ref<string | null>(null)
const deletingDocId = ref<string | null>(null)

async function loadDocs() {
  try {
    const res = await $fetch<{ docs: Doc[] }>('/api/admin/docs')
    docs.value = res.docs ?? []
    docsError.value = ''
  } catch {
    docsError.value = 'Failed to load docs.'
  }
}

function openDeleteConfirm(id: string) {
  pendingDeleteDocId.value = id
  deleteConfirmOpen.value = true
}

async function confirmDeleteDoc() {
  if (!pendingDeleteDocId.value) return
  deletingDocId.value = pendingDeleteDocId.value
  try {
    await $fetch(`/api/admin/docs/${pendingDeleteDocId.value}`, { method: 'DELETE' })
    toast.add({ title: 'Doc deleted', color: 'success' })
    await loadDocs()
  } catch {
    toast.add({ title: 'Failed to delete doc', color: 'error' })
  } finally {
    deletingDocId.value = null
    deleteConfirmOpen.value = false
    pendingDeleteDocId.value = null
  }
}

onMounted(loadDocs)
</script>
