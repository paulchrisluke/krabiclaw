<template>
  <UPage>
    <UPageBody>
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-lg font-semibold text-highlighted">Site Q&A</h1>
          <p class="mt-1 text-sm text-muted">Questions shown across the firm rather than at one location.</p>
        </div>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" aria-label="Refresh Q&A" @click="refresh()" />
      </div>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section class="space-y-3">
          <USkeleton v-if="pending" class="h-32" />
          <div v-else-if="qaRows.length === 0" class="border border-dashed border-default px-6 py-12 text-center">
            <UIcon name="i-lucide-circle-help" class="mx-auto size-9 text-muted" />
            <p class="mt-3 text-sm font-medium text-highlighted">No site Q&A yet</p>
          </div>
          <template v-else>
            <article v-for="item in qaRows" :key="item.id" class="border-b border-default py-4 first:pt-0">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex flex-wrap gap-2">
                    <UBadge :color="item.status === 'published' ? 'success' : 'neutral'" variant="soft">{{ item.status }}</UBadge>
                    <span class="text-xs text-muted">Order {{ item.sort_order }}</span>
                  </div>
                  <h2 class="mt-3 text-sm font-semibold text-highlighted">{{ item.question }}</h2>
                  <p class="mt-2 text-sm text-muted">{{ item.answer || 'No answer yet.' }}</p>
                </div>
                <div class="flex shrink-0 gap-1">
                  <UButton icon="i-lucide-arrow-up" size="sm" color="neutral" variant="ghost" aria-label="Move up" @click="move(item, -1)" />
                  <UButton icon="i-lucide-arrow-down" size="sm" color="neutral" variant="ghost" aria-label="Move down" @click="move(item, 1)" />
                  <UButton icon="i-lucide-square-pen" size="sm" color="neutral" variant="ghost" aria-label="Edit" @click="edit(item)" />
                  <UButton icon="i-lucide-trash-2" size="sm" color="error" variant="ghost" aria-label="Delete" @click="remove(item)" />
                </div>
              </div>
            </article>
          </template>
        </section>

        <UCard>
          <template #header><h2 class="font-semibold text-highlighted">{{ editingId ? 'Edit Q&A' : 'Add Q&A' }}</h2></template>
          <div class="space-y-4">
            <UFormField label="Question"><UTextarea v-model="form.question" :rows="3" /></UFormField>
            <UFormField label="Answer"><UTextarea v-model="form.answer" :rows="5" /></UFormField>
            <UCheckbox v-model="form.published" label="Published" />
            <div class="flex gap-2">
              <UButton v-if="editingId" block color="neutral" variant="ghost" @click="reset">Cancel</UButton>
              <UButton block :loading="saving" :disabled="!form.question.trim()" @click="save">{{ editingId ? 'Save' : 'Add question' }}</UButton>
            </div>
          </div>
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Site Q&A | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

interface QaRow {
  id: string
  question: string
  answer: string | null
  status: 'published' | 'hidden'
  sort_order: number
}

const siteId = await useDashboardSiteId()
const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
const toast = useToast()
const saving = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ question: '', answer: '', published: true })
const { data, pending, refresh } = await useAsyncData(
  `dashboard-site-qa-${siteId}`,
  () => $fetch<{ qa: QaRow[] }>(`/api/editor/sites/${siteId}/qa`, { headers }),
)
const qaRows = computed(() => data.value?.qa ?? [])

function reset() {
  editingId.value = null
  form.question = ''
  form.answer = ''
  form.published = true
}

function edit(item: QaRow) {
  editingId.value = item.id
  form.question = item.question
  form.answer = item.answer ?? ''
  form.published = item.status === 'published'
}

async function save() {
  saving.value = true
  try {
    const body = { question: form.question, answer: form.answer || null, status: form.published ? 'published' : 'hidden' }
    if (editingId.value) await $fetch(`/api/editor/sites/${siteId}/qa/${editingId.value}`, { method: 'PATCH', body })
    else await $fetch(`/api/editor/sites/${siteId}/qa`, { method: 'POST', body })
    reset()
    await refresh()
    toast.add({ description: 'Site Q&A saved', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to save Q&A', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function move(item: QaRow, direction: -1 | 1) {
  const index = qaRows.value.findIndex(row => row.id === item.id)
  const target = qaRows.value[index + direction]
  if (!target) return
  await $fetch(`/api/editor/sites/${siteId}/qa/reorder`, {
    method: 'POST',
    body: { updates: [{ id: item.id, sort_order: target.sort_order }, { id: target.id, sort_order: item.sort_order }] },
  })
  await refresh()
}

async function remove(item: QaRow) {
  if (!confirm(`Delete this question?\n\n${item.question}`)) return
  await $fetch(`/api/editor/sites/${siteId}/qa/${item.id}`, { method: 'DELETE' })
  if (editingId.value === item.id) reset()
  await refresh()
}
</script>
