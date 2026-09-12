<template>
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
        <UBadge color="neutral" variant="subtle">{{ COLLECTION_METHOD_LABELS[item.row.collection_method] }}</UBadge>
      </div>
      <p v-if="item.row.title" class="mt-2 text-sm font-semibold text-highlighted">{{ item.row.title }}</p>
      <p class="mt-1 line-clamp-2 text-sm text-muted">{{ item.row.content }}</p>
    </template>
  </DashboardListEditor>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import {
  COLLECTION_METHOD_LABELS,
  isTestimonialsResponse,
  isReviewDeletedResponse,
  type SiteTestimonial,
} from '~/utils/testimonials'

const dashboardApi = useDashboardApi()
const route = useRoute()
const toast = useToast()
const requestEvent = useRequestEvent()
const siteId = await useDashboardSiteId()

const testimonialsPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/testimonials`)

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

const editing = ref(false)
const removingId = ref<string | null>(null)

// A row opens its own level rather than a sheet over the list, so adding and
// editing are the same screen and the record has a URL of its own.
function openNew() {
  void navigateTo(`${testimonialsPath.value}/new`)
}

function openExisting(item: { id: string }) {
  void navigateTo(`${testimonialsPath.value}/${item.id}`)
}

async function removeItem(item: { id: string }) {
  removingId.value = item.id
  try {
    await dashboardApi(`/api/editor/sites/${siteId}/reviews/${item.id}`, {
      method: 'DELETE',
      validate: isReviewDeletedResponse,
    })
    await refresh()
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to remove testimonial', color: 'error' })
  } finally {
    removingId.value = null
  }
}
</script>
