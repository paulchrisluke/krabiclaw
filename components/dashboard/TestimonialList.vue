<template>
  <DashboardListEditor
    read-only
    title="Testimonials"
    description="Reviews and testimonials are read-only. Manage Google reviews and replies in Google."
    :items="listItems"
    :pending="pending"
    :error="error ? getErrorMessage(error, 'Reviews request failed') : null"
    empty-title="No testimonials yet"
    empty-icon="i-lucide-star"
  >
    <template #item="{ item }">
      <div class="flex flex-wrap items-center gap-2">
        <strong class="text-sm text-highlighted">{{ item.row.author_name }}</strong>
        <UBadge color="warning" variant="soft">{{ item.row.rating }} stars</UBadge>
        <UBadge :color="item.row.status === 'approved' ? 'success' : 'neutral'" variant="soft">{{ item.row.status }}</UBadge>
        <UBadge v-if="item.row.collection_method !== null" color="neutral" variant="subtle">{{ COLLECTION_METHOD_LABELS[item.row.collection_method] }}</UBadge>
      </div>
      <p v-if="item.row.title" class="mt-2 text-sm font-semibold text-highlighted">{{ item.row.title }}</p>
      <p class="mt-1 text-sm text-muted">{{ item.row.content }}</p>
    </template>
  </DashboardListEditor>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import { getErrorMessage } from '~/utils/errors'
import {
  COLLECTION_METHOD_LABELS,
  isTestimonialsResponse,
  type SiteTestimonial,
} from '~/utils/testimonials'

const dashboardApi = useDashboardApi()
const siteId = await useDashboardSiteId()

const { data, pending, error } = await useAsyncData(
  `dashboard-site-testimonials-${siteId}`,
  () => dashboardApi<{ reviews: SiteTestimonial[] }>(
    `/api/editor/sites/${siteId}/reviews`,
    { validate: isTestimonialsResponse },
  ),
  // Nuxt blocks navigation on useAsyncData by default; the client does not
  // need to wait for this to paint the route, and `pending` already drives a
  // loading state here.
  { lazy: true },
)

const testimonials = computed(() => data.value?.reviews ?? [])
const listItems = computed(() => testimonials.value.map(row => ({ id: row.id, title: row.author_name, row })))

</script>
