<template>
  <div>
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
        <UBadge :color="STATUS_COLORS[item.row.status]" variant="soft">{{ STATUS_LABELS[item.row.status] }}</UBadge>
        <UBadge v-if="item.row.collection_method !== null" color="neutral" variant="subtle">{{ COLLECTION_METHOD_LABELS[item.row.collection_method] }}</UBadge>
      </div>
      <p v-if="item.row.title" class="mt-2 text-sm font-semibold text-highlighted">{{ item.row.title }}</p>
      <p class="mt-1 line-clamp-2 text-sm text-muted">{{ item.row.content }}</p>
    </template>
  </DashboardListEditor>

  <!--
    A review opens over the list rather than on its own level: moderating it is
    one decision about one row. Its id is in the URL, so the review-received
    notification lands straight on it.
  -->
  <DashboardListItemDialog
    :open="Boolean(openReview)"
    :title="openReview ? `Review from ${openReview.author_name}` : 'Review'"
    :show-actions="false"
    :error="moderationError"
    @update:open="value => { if (!value) closeReview() }"
  >
    <div v-if="openReview" class="space-y-4" data-testid="review-moderation">
      <div class="flex flex-wrap items-center gap-2">
        <UBadge color="warning" variant="soft">{{ openReview.rating }} stars</UBadge>
        <UBadge :color="STATUS_COLORS[openReview.status]" variant="soft" data-testid="review-moderation-status">{{ STATUS_LABELS[openReview.status] }}</UBadge>
        <span class="text-xs text-muted">{{ new Date(openReview.created_at).toLocaleDateString() }}</span>
      </div>
      <p v-if="openReview.title" class="text-sm font-semibold text-highlighted">{{ openReview.title }}</p>
      <p class="whitespace-pre-line text-sm text-muted">{{ openReview.content }}</p>
      <p class="text-sm text-muted">{{ STATUS_EXPLANATIONS[openReview.status] }}</p>
      <div class="flex items-center justify-end gap-2 pt-1">
        <UButton
          v-if="openReview.status !== 'rejected'"
          label="Archive"
          color="neutral"
          variant="soft"
          :loading="moderating === 'rejected'"
          :disabled="moderating !== null"
          @click="moderate('rejected')"
        />
        <UButton
          v-if="openReview.status !== 'approved'"
          label="Publish"
          :loading="moderating === 'approved'"
          :disabled="moderating !== null"
          @click="moderate('approved')"
        />
      </div>
    </div>
  </DashboardListItemDialog>
  </div>
</template>

<script setup lang="ts">
import DashboardListEditor from '~/components/dashboard/DashboardListEditor.vue'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
import { getErrorMessage } from '~/utils/errors'
import {
  COLLECTION_METHOD_LABELS,
  isTestimonialsResponse,
  type OrganizationTestimonial,
  type TestimonialStatus,
} from '~/utils/testimonials'

/** Set when this list is a location's reviews rather than the site's. */
const props = defineProps<{ locationId?: string }>()

// `rejected` is the stored status; the owner archives a review, and an archived
// review is hidden from the public site.
const STATUS_LABELS: Record<TestimonialStatus, string> = { pending: 'Pending', approved: 'Published', rejected: 'Archived' }
const STATUS_COLORS: Record<TestimonialStatus, 'warning' | 'success' | 'neutral'> = { pending: 'warning', approved: 'success', rejected: 'neutral' }
const STATUS_EXPLANATIONS: Record<TestimonialStatus, string> = {
  pending: 'Waiting for you. It is not on your site until you publish it.',
  approved: 'Shown on your site.',
  rejected: 'Hidden from your site.',
}

const route = useRoute()
const router = useRouter()
const dashboardApi = useDashboardApi()
const organizationId = await useDashboardOrganizationId()

const { data, pending, error, refresh } = await useAsyncData(
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
const reviewLink = (id: string) => `${route.path}?tab=reviews&review=${encodeURIComponent(id)}`
const listItems = computed(() => testimonials.value.map(row => ({ id: row.id, title: row.author_name, to: reviewLink(row.id), row })))

const openReviewId = computed(() => typeof route.query.review === 'string' ? route.query.review : null)
const openReview = computed(() => testimonials.value.find(row => row.id === openReviewId.value) ?? null)
const moderating = ref<'approved' | 'rejected' | null>(null)
const moderationError = ref<string | null>(null)

function closeReview() {
  moderationError.value = null
  void router.replace({ query: { ...route.query, review: undefined } })
}

async function moderate(status: 'approved' | 'rejected') {
  const review = openReview.value
  if (!review) return
  moderating.value = status
  moderationError.value = null
  try {
    await dashboardApi(`/api/editor/organizations/${organizationId}/reviews/${encodeURIComponent(review.id)}`, {
      method: 'PATCH',
      body: { status },
      validate: (value): value is { review_id: string; status: TestimonialStatus } =>
        isRecord(value) && value.review_id === review.id && value.status === status,
    })
    await refresh()
  } catch (caught) {
    moderationError.value = getErrorMessage(caught, 'Review could not be updated')
  } finally {
    moderating.value = null
  }
}
</script>
