<template>
  <DashboardListEditor
    read-only
    title="Reviews"
    :items="listItems"
    :pending="pending"
    :error="error ? getErrorMessage(error, 'Reviews request failed') : null"
    empty-title="No reviews yet"
    empty-icon="i-lucide-star"
  >
    <template #item="{ item }">
      <div class="flex flex-wrap items-center gap-2">
        <strong class="text-sm text-highlighted">{{ item.row.author_name }}</strong>
        <UBadge color="warning" variant="soft">{{ item.row.rating }} stars</UBadge>
        <UBadge :color="STATUS_COLORS[item.row.status]" variant="soft">{{ REVIEW_STATUS_LABELS[item.row.status] }}</UBadge>
        <UBadge v-if="item.row.collection_method !== null" color="neutral" variant="subtle">{{ COLLECTION_METHOD_LABELS[item.row.collection_method] }}</UBadge>
      </div>
      <p v-if="item.row.title" class="mt-2 text-sm font-semibold text-highlighted">{{ item.row.title }}</p>
      <p class="mt-1 line-clamp-2 text-sm text-muted">{{ item.row.content }}</p>
    </template>
  </DashboardListEditor>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import { getErrorMessage } from '~/utils/errors'
import {
  COLLECTION_METHOD_LABELS,
  REVIEW_STATUS_LABELS,
  isTestimonialsResponse,
  type OrganizationTestimonial,
  type TestimonialStatus,
} from '~/utils/testimonials'

/** Set when this list is a location's reviews rather than the site's. */
const props = defineProps<{ locationId?: string }>()

const STATUS_COLORS: Record<TestimonialStatus, 'warning' | 'success' | 'neutral'> = { pending: 'warning', approved: 'success', rejected: 'neutral' }

const dashboardApi = useDashboardApi()
const level = useRouteLevel()
const organizationId = await useDashboardOrganizationId()

const { data, pending, error } = await useAsyncData(
  () => props.locationId ? `dashboard-location-reviews-${organizationId}-${props.locationId}` : `dashboard-organization-reviews-${organizationId}`,
  () => dashboardApi<{ reviews: OrganizationTestimonial[] }>(
    `/api/editor/organizations/${organizationId}/reviews`,
    { query: props.locationId ? { location_id: props.locationId } : undefined, validate: isTestimonialsResponse },
  ),
  // Nuxt blocks navigation on useAsyncData by default; the client does not
  // need to wait for this to paint the route, and `pending` already drives a
  // loading state here.
  { lazy: true },
)

const testimonials = computed(() => data.value?.reviews ?? [])
// A review is a record, so its row links to its own level, as a question's does.
const listItems = computed(() => testimonials.value.map(row => ({ id: row.id, title: row.author_name, to: `${level.path.value}/reviews/${row.id}`, row })))
</script>
