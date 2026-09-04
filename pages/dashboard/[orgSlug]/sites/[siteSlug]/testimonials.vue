<template>
  <UDashboardPanel id="site-testimonials">
    <template #header>
      <UDashboardNavbar title="Site" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="paths.site" label="Site" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <DashboardListEditor
        v-model:editing="editing"
        title="Testimonials"
        description="Owner-entered testimonials require provenance and publication authorization."
        :items="listItems"
        :pending="pending"
        empty-title="No testimonials yet"
        empty-icon="i-lucide-star"
        add-label="Add a testimonial"
        :removing-id="removingId"
        @add="openNew"
        @open="openExisting"
        @remove="removeItem"
      >
        <template #item="{ item }">
          <div class="flex flex-wrap items-center gap-2">
            <strong class="text-sm text-highlighted">{{ item.row.author_name }}</strong>
            <UBadge color="warning" variant="soft">{{ item.row.rating }} stars</UBadge>
            <UBadge :color="item.row.status === 'approved' ? 'success' : 'neutral'" variant="soft">{{ item.row.status }}</UBadge>
            <UBadge color="neutral" variant="subtle">{{ methodLabel(item.row.collection_method) }}</UBadge>
          </div>
          <p v-if="item.row.title" class="mt-2 text-sm font-semibold text-highlighted">{{ item.row.title }}</p>
          <p class="mt-1 line-clamp-2 text-sm text-muted">{{ item.row.content }}</p>
        </template>
      </DashboardListEditor>

      <DashboardListItemDialog
        v-model:open="dialogOpen"
        :title="editingId ? 'Edit testimonial' : 'Add a testimonial'"
        :removable="Boolean(editingId)"
        :saving="saving"
        :removing="removingId === editingId"
        :save-disabled="!canSave"
        @save="save"
        @remove="removeEditing"
      >
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Reviewer"><UInput v-model="form.author_name" class="w-full" /></UFormField>
          <UFormField label="Rating"><UInputNumber v-model="form.rating" :min="1" :max="5" :step="1" class="w-full" /></UFormField>
        </div>
        <UFormField label="Title"><UInput v-model="form.title" class="w-full" /></UFormField>
        <UFormField label="Testimonial"><UTextarea v-model="form.content" :rows="5" class="w-full" /></UFormField>
        <UFormField label="Collected through">
          <USelect v-model="form.collection_method" :items="collectionMethods" value-key="value" label-key="label" class="w-full" />
        </UFormField>
        <UFormField label="Original date"><UInput v-model="form.original_review_date" type="date" class="w-full" /></UFormField>
        <UFormField label="Reference"><UInput v-model="form.original_reference" placeholder="Email thread, intake note, or migration source" class="w-full" /></UFormField>
        <UFormField label="Status"><USelect v-model="form.status" :items="statusItems" class="w-full" /></UFormField>
        <UCheckbox v-model="form.publication_authorized" label="I confirm the reviewer authorized publication" />
        <p class="text-xs text-muted">Owner-entered testimonial · Not KrabiClaw verified</p>
      </DashboardListItemDialog>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'

const dashboardApi = useDashboardApi()
definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'site.testimonials' })

const { paths } = useDashboardSiteLinks()
useSeoMeta({ title: 'Testimonials | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
const requestEvent = useRequestEvent()

type CollectionMethod = 'in_person' | 'email' | 'phone' | 'migration' | 'other'
interface SiteTestimonial {
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

const isSiteTestimonial = (value: unknown): value is SiteTestimonial =>
  isRecord(value)
  && typeof value.id === 'string'
  && typeof value.author_name === 'string'
  && typeof value.rating === 'number'
  && typeof value.content === 'string'
  && typeof value.status === 'string'
const isTestimonialsResponse = (value: unknown): value is { reviews: SiteTestimonial[] } =>
  isRecord(value) && Array.isArray(value.reviews) && value.reviews.every(isSiteTestimonial)
const isReviewCreatedResponse = (value: unknown): value is { id: string; created: true } =>
  isRecord(value) && typeof value.id === 'string' && value.created === true
const isReviewUpdatedResponse = (value: unknown): value is { updated: true } =>
  isRecord(value) && value.updated === true
const isReviewDeletedResponse = (value: unknown): value is { review_id: string; deleted: true } =>
  isRecord(value) && typeof value.review_id === 'string' && value.deleted === true

const siteId = await useDashboardSiteId()
const route = useRoute()
const toast = useToast()
const saving = ref(false)
const collectionMethods = [
  { label: 'In person', value: 'in_person' }, { label: 'Email', value: 'email' },
  { label: 'Phone', value: 'phone' }, { label: 'Migration', value: 'migration' }, { label: 'Other', value: 'other' },
]
const statusItems = ['pending', 'approved', 'rejected']
const form = reactive({
  author_name: '', rating: 5, title: '', content: '', collection_method: 'in_person' as CollectionMethod,
  original_review_date: '', original_reference: '', publication_authorized: false, status: 'pending' as SiteTestimonial['status'],
})
const { data, pending, refresh } = await useAsyncData(
  `dashboard-site-testimonials-${siteId}`,
  async () => {
    if (import.meta.server) {
      if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Dashboard request context unavailable' })
      const orgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
      const siteSlug = typeof route.params.siteSlug === 'string' ? route.params.siteSlug : null
      if (!orgSlug || !siteSlug) throw createError({ statusCode: 400, statusMessage: 'Dashboard scope is required' })
      const [{ cloudflareEnv }, { loadDashboardContext }, { listSiteReviews }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/dashboard-context-service'),
        import('~/server/utils/site-reviews'),
      ])
      const db = cloudflareEnv(requestEvent).DB
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      const context = await loadDashboardContext(requestEvent, { orgSlug, siteSlug })
      if (context.site?.id !== siteId) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
      return { reviews: await listSiteReviews(db, siteId) as unknown as SiteTestimonial[] }
    }
    return await dashboardApi<{ reviews: SiteTestimonial[] }>(
      `/api/editor/sites/${siteId}/reviews`,
      { validate: isTestimonialsResponse },
    )
  },
)
const testimonials = computed(() => data.value?.reviews ?? [])
const listItems = computed(() => testimonials.value.map(row => ({ id: row.id, title: row.author_name, row })))

const { editing, dialogOpen, editingId, removingId, openNew, openExisting, close, removeItem, removeEditing } = useListEditor<SiteTestimonial>({
  find: id => testimonials.value.find(row => row.id === id) ?? null,
  fill: row => Object.assign(form, {
    author_name: row.author_name, rating: row.rating, title: row.title ?? '', content: row.content,
    collection_method: row.collection_method, original_review_date: row.original_review_date ?? '',
    original_reference: row.original_reference ?? '', publication_authorized: row.publication_authorized, status: row.status,
  }),
  clear: reset,
  destroy: async (id) => {
    try {
      await dashboardApi(`/api/editor/sites/${siteId}/reviews/${id}`, {
        method: 'DELETE',
        validate: isReviewDeletedResponse,
      })
      await refresh()
    } catch (error) {
      toast.add({ description: error instanceof Error ? error.message : 'Failed to remove testimonial', color: 'error' })
    }
  },
})
const canSave = computed(() => Boolean(form.author_name.trim() && form.content.trim() && Number.isInteger(form.rating) && form.rating >= 1 && form.rating <= 5 && form.publication_authorized))

function methodLabel(method: CollectionMethod) {
  return collectionMethods.find(item => item.value === method)?.label ?? method
}

function reset() {
  Object.assign(form, { author_name: '', rating: 5, title: '', content: '', collection_method: 'in_person', original_review_date: '', original_reference: '', publication_authorized: false, status: 'pending' })
}


async function save() {
  saving.value = true
  try {
    const body = { ...form, title: form.title || null, original_review_date: form.original_review_date || null, original_reference: form.original_reference || null }
    if (editingId.value) {
      await dashboardApi(`/api/editor/sites/${siteId}/reviews/${editingId.value}`, {
        method: 'PATCH',
        body,
        validate: isReviewUpdatedResponse,
      })
    } else {
      await dashboardApi(`/api/editor/sites/${siteId}/reviews`, {
        method: 'POST',
        body,
        validate: isReviewCreatedResponse,
      })
    }
    close()
    await refresh()
    toast.add({ description: 'Testimonial saved', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to save testimonial', color: 'error' })
  } finally {
    saving.value = false
  }
}

</script>
