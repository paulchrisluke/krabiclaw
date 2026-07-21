<template>
  <UPage>
    <UPageBody>
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-lg font-semibold text-highlighted">Site Reviews</h1>
          <p class="mt-1 text-sm text-muted">Owner-entered feedback requires provenance and publication authorization.</p>
        </div>
        <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" aria-label="Refresh reviews" @click="refresh()" />
      </div>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section class="space-y-4">
          <USkeleton v-if="pending" class="h-36" />
          <div v-else-if="reviews.length === 0" class="border border-dashed border-default px-6 py-12 text-center">
            <UIcon name="i-lucide-star" class="mx-auto size-9 text-muted" />
            <p class="mt-3 text-sm font-medium text-highlighted">No site reviews yet</p>
          </div>
          <template v-else>
            <article v-for="review in reviews" :key="review.id" class="border-b border-default pb-4">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <strong class="text-sm text-highlighted">{{ review.author_name }}</strong>
                    <UBadge color="warning" variant="soft">{{ review.rating }} stars</UBadge>
                    <UBadge :color="review.status === 'approved' ? 'success' : 'neutral'" variant="soft">{{ review.status }}</UBadge>
                    <UBadge color="neutral" variant="subtle">{{ methodLabel(review.collection_method) }}</UBadge>
                  </div>
                  <h2 v-if="review.title" class="mt-3 text-sm font-semibold text-highlighted">{{ review.title }}</h2>
                  <p class="mt-2 text-sm leading-6 text-muted">{{ review.content }}</p>
                  <p class="mt-2 text-xs text-muted">Owner-entered · Not KrabiClaw verified</p>
                </div>
                <div class="flex shrink-0 gap-1">
                  <UButton icon="i-lucide-square-pen" size="sm" color="neutral" variant="ghost" aria-label="Edit" @click="edit(review)" />
                  <UButton icon="i-lucide-trash-2" size="sm" color="error" variant="ghost" aria-label="Delete" @click="remove(review)" />
                </div>
              </div>
            </article>
          </template>
        </section>

        <UCard>
          <template #header><h2 class="font-semibold text-highlighted">{{ editingId ? 'Edit review' : 'Add review' }}</h2></template>
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <UFormField label="Reviewer"><UInput v-model="form.author_name" /></UFormField>
              <UFormField label="Rating"><UInputNumber v-model="form.rating" :min="1" :max="5" :step="1" class="w-full" /></UFormField>
            </div>
            <UFormField label="Title"><UInput v-model="form.title" /></UFormField>
            <UFormField label="Review"><UTextarea v-model="form.content" :rows="5" /></UFormField>
            <UFormField label="Collected through">
              <USelect v-model="form.collection_method" :items="collectionMethods" value-key="value" label-key="label" />
            </UFormField>
            <UFormField label="Original date"><UInput v-model="form.original_review_date" type="date" /></UFormField>
            <UFormField label="Reference"><UInput v-model="form.original_reference" placeholder="Email thread, intake note, or migration source" /></UFormField>
            <UFormField label="Status"><USelect v-model="form.status" :items="statusItems" /></UFormField>
            <UCheckbox v-model="form.publication_authorized" label="I confirm the reviewer authorized publication" />
            <div class="flex gap-2">
              <UButton v-if="editingId" block color="neutral" variant="ghost" @click="reset">Cancel</UButton>
              <UButton block :loading="saving" :disabled="!canSave" @click="save">{{ editingId ? 'Save' : 'Add review' }}</UButton>
            </div>
          </div>
        </UCard>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Site Reviews | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

type CollectionMethod = 'in_person' | 'email' | 'phone' | 'migration' | 'other'
interface SiteReview {
  id: string
  author_name: string
  rating: number
  title: string | null
  content: string
  collection_method: CollectionMethod
  original_review_date: string | null
  original_reference: string | null
  publication_authorized: boolean
  status: 'pending' | 'approved' | 'rejected'
}

const siteId = await useDashboardSiteId()
const headers = buildDashboardRequestHeaders()
const toast = useToast()
const saving = ref(false)
const editingId = ref<string | null>(null)
const collectionMethods = [
  { label: 'In person', value: 'in_person' }, { label: 'Email', value: 'email' },
  { label: 'Phone', value: 'phone' }, { label: 'Migration', value: 'migration' }, { label: 'Other', value: 'other' },
]
const statusItems = ['pending', 'approved', 'rejected']
const form = reactive({
  author_name: '', rating: 5, title: '', content: '', collection_method: 'in_person' as CollectionMethod,
  original_review_date: '', original_reference: '', publication_authorized: false, status: 'pending' as SiteReview['status'],
})
const { data, pending, refresh } = await useAsyncData(
  `dashboard-site-reviews-${siteId}`,
  () => $fetch<{ reviews: SiteReview[] }>(`/api/editor/sites/${siteId}/reviews`, { headers }),
)
const reviews = computed(() => data.value?.reviews ?? [])
const canSave = computed(() => Boolean(form.author_name.trim() && form.content.trim() && Number.isInteger(form.rating) && form.rating >= 1 && form.rating <= 5 && form.publication_authorized))

function methodLabel(method: CollectionMethod) {
  return collectionMethods.find(item => item.value === method)?.label ?? method
}

function reset() {
  editingId.value = null
  Object.assign(form, { author_name: '', rating: 5, title: '', content: '', collection_method: 'in_person', original_review_date: '', original_reference: '', publication_authorized: false, status: 'pending' })
}

function edit(review: SiteReview) {
  editingId.value = review.id
  Object.assign(form, {
    author_name: review.author_name, rating: review.rating, title: review.title ?? '', content: review.content,
    collection_method: review.collection_method, original_review_date: review.original_review_date ?? '',
    original_reference: review.original_reference ?? '', publication_authorized: review.publication_authorized, status: review.status,
  })
}

async function save() {
  saving.value = true
  try {
    const body = { ...form, title: form.title || null, original_review_date: form.original_review_date || null, original_reference: form.original_reference || null }
    if (editingId.value) await $fetch(`/api/editor/sites/${siteId}/reviews/${editingId.value}`, { method: 'PATCH', body })
    else await $fetch(`/api/editor/sites/${siteId}/reviews`, { method: 'POST', body })
    reset()
    await refresh()
    toast.add({ description: 'Site review saved', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to save review', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function remove(review: SiteReview) {
  if (!confirm(`Delete the review from ${review.author_name}?`)) return
  await $fetch(`/api/editor/sites/${siteId}/reviews/${review.id}`, { method: 'DELETE' })
  if (editingId.value === review.id) reset()
  await refresh()
}
</script>
