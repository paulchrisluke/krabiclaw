<template>
  <UDashboardPanel id="location-qa">
    <template #header>
      <UDashboardNavbar title="Q&A">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="loadQa">Refresh</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div class="space-y-3">
          <div v-if="loading" class="space-y-3">
            <USkeleton v-for="i in 4" :key="i" class="h-28 rounded-lg" />
          </div>

          <div v-else-if="qaRows.length === 0" class="rounded-lg border border-dashed border-default px-6 py-12 text-center">
            <UIcon name="i-lucide-circle-help" class="mx-auto size-9 text-muted" />
            <p class="mt-3 text-sm font-medium text-highlighted">No Q&A yet</p>
            <p class="mt-1 text-sm text-muted">Add common guest questions, then answer them once.</p>
          </div>

          <div v-else v-for="item in qaRows" :key="item.id" class="rounded-lg border border-default bg-default p-4">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge :color="item.status === 'published' ? 'success' : 'neutral'" variant="soft">{{ item.status }}</UBadge>
                  <UBadge v-if="item.source === 'gmb'" color="neutral" variant="subtle">Google</UBadge>
                  <span class="text-xs text-muted">{{ item.upvote_count }} upvotes</span>
                </div>
                <p class="mt-3 text-sm font-semibold text-highlighted">{{ item.question }}</p>
                <p v-if="item.answer" class="mt-2 text-sm text-muted">{{ item.answer }}</p>
                <p v-else class="mt-2 text-sm italic text-muted">No answer yet.</p>
              </div>
              <div class="flex shrink-0 gap-1">
                <UButton icon="i-lucide-arrow-up" size="sm" color="neutral" variant="ghost" @click="moveQa(item, -1)" />
                <UButton icon="i-lucide-arrow-down" size="sm" color="neutral" variant="ghost" @click="moveQa(item, 1)" />
                <UButton icon="i-lucide-square-pen" size="sm" color="neutral" variant="ghost" @click="startEdit(item)" />
                <UButton
                  :icon="item.status === 'published' ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  @click="toggleStatus(item)"
                />
                <UButton icon="i-lucide-trash-2" size="sm" color="error" variant="ghost" :loading="deletingId === item.id" @click="deleteQa(item)" />
              </div>
            </div>
          </div>
        </div>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">Add Q&A</h2>
          </template>

          <div class="space-y-4">
            <UFormField label="Question">
              <UTextarea v-model="form.question" :rows="3" placeholder="Do you accept walk-ins?" />
            </UFormField>
            <UFormField label="Answer">
              <UTextarea v-model="form.answer" :rows="4" placeholder="Yes, walk-ins are welcome when seats are available." />
            </UFormField>
            <div class="flex gap-2">
              <UButton v-if="editingId" block color="neutral" variant="ghost" @click="resetForm">Cancel</UButton>
              <UButton block :loading="saving" :disabled="!locationId || !form.question.trim()" @click="saveQa">
                {{ editingId ? 'Save changes' : 'Add question' }}
              </UButton>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

interface QaRow {
  id: string
  question: string
  answer: string | null
  status: string
  source: string
  upvote_count: number
  sort_order: number
}

const _siteId = await useDashboardSiteId()
const dashboardLocation = useDashboardLocation()
const toast = useToast()
const locationId = computed(() => dashboardLocation.currentLocationId.value)
const qaRows = ref<QaRow[]>([])
const loading = ref(true)
const saving = ref(false)
const deletingId = ref<string | null>(null)
const editingId = ref<string | null>(null)
const form = reactive({ question: '', answer: '' })

async function loadQa() {
  if (!locationId.value) {
    qaRows.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const res = await $fetch<{ qa: QaRow[] }>(`/api/dashboard/editor/locations/${locationId.value}/qa`)
    qaRows.value = res.qa ?? []
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load Q&A', color: 'error' })
  } finally {
    loading.value = false
  }
}

function resetForm() {
  editingId.value = null
  form.question = ''
  form.answer = ''
}

function startEdit(item: QaRow) {
  editingId.value = item.id
  form.question = item.question
  form.answer = item.answer ?? ''
}

async function saveQa() {
  if (!locationId.value) return
  saving.value = true
  try {
    if (editingId.value) {
      await $fetch(`/api/dashboard/editor/locations/${locationId.value}/qa/${editingId.value}`, {
        method: 'PATCH',
        body: { question: form.question, answer: form.answer || null, is_owner_answer: 1 }
      })
      toast.add({ description: 'Q&A updated', color: 'success' })
    } else {
      await $fetch(`/api/dashboard/editor/locations/${locationId.value}/qa`, {
        method: 'POST',
        body: { question: form.question, answer: form.answer || null, is_owner_answer: 1 }
      })
      toast.add({ description: 'Q&A added', color: 'success' })
    }
    resetForm()
    await loadQa()
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to save Q&A', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function updateQa(item: QaRow, body: ApiRecord, successMessage: string) {
  if (!locationId.value) return
  try {
    await $fetch(`/api/dashboard/editor/locations/${locationId.value}/qa/${item.id}`, {
      method: 'PATCH',
      body
    })
    toast.add({ description: successMessage, color: 'success' })
    await loadQa()
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update Q&A', color: 'error' })
  }
}

async function toggleStatus(item: QaRow) {
  await updateQa(item, { status: item.status === 'published' ? 'hidden' : 'published' }, item.status === 'published' ? 'Q&A hidden' : 'Q&A published')
}

async function moveQa(item: QaRow, direction: -1 | 1) {
  if (!locationId.value) return
  const currentIndex = qaRows.value.findIndex(row => row.id === item.id)
  if (currentIndex === -1) return
  const targetIndex = currentIndex + direction
  if (targetIndex < 0 || targetIndex >= qaRows.value.length) return
  const target = qaRows.value[targetIndex]
  if (!target) return
  try {
    await $fetch(`/api/dashboard/editor/locations/${locationId.value}/qa/reorder`, {
      method: 'POST',
      body: {
        updates: [
          { id: item.id, sort_order: target.sort_order },
          { id: target.id, sort_order: item.sort_order }
        ]
      }
    })
    toast.add({ description: 'Q&A reordered', color: 'success' })
    await loadQa()
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to reorder Q&A', color: 'error' })
  }
}

async function deleteQa(item: QaRow) {
  if (!locationId.value) return
  if (!confirm(`Delete this question?\n\n${item.question}`)) return
  deletingId.value = item.id
  try {
    await $fetch(`/api/dashboard/editor/locations/${locationId.value}/qa/${item.id}`, { method: 'DELETE' })
    qaRows.value = qaRows.value.filter(row => row.id !== item.id)
    toast.add({ description: 'Q&A deleted', color: 'neutral' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to delete Q&A', color: 'error' })
  } finally {
    deletingId.value = null
  }
}

onMounted(async () => {
  try {
    await loadQa()
  } catch (error) {
    loading.value = false
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load Q&A page', color: 'error' })
  }
})

watch(locationId, () => {
  editingId.value = null
  form.question = ''
  form.answer = ''
  void loadQa()
})

useSeoMeta({ title: 'Q&A | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
