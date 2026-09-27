<template>
  <!-- A review: the guest's words, read-only, and the one thing the owner decides about it. -->
  <DashboardIndexPanel
    id="organization-review-record"
    :title="record ? `Review from ${record.author_name}` : 'Review'"
    :auto-open="record ? `${recordPath}/visibility` : null"
  >
    <UAlert
      v-if="errorMessage"
      class="mb-6"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :description="errorMessage"
    />
    <div v-if="record" class="mb-6 space-y-3" data-testid="review-record">
      <div class="flex flex-wrap items-center gap-2">
        <UBadge color="warning" variant="soft">{{ record.rating }} stars</UBadge>
        <span class="text-xs text-muted">{{ new Date(record.created_at).toLocaleDateString() }}</span>
      </div>
      <p v-if="record.title" class="text-sm font-semibold text-highlighted">{{ record.title }}</p>
      <p class="whitespace-pre-line text-sm text-muted">{{ record.content }}</p>
    </div>
    <EditorNavigationList :groups="navigationGroups" :active-item="level.child.value" />
  </DashboardIndexPanel>
</template>

<script lang="ts">
import type { InjectionKey, Reactive, Ref } from 'vue'
import { REVIEW_STATUS_LABELS, isTestimonialsResponse, type OrganizationTestimonial, type TestimonialStatus } from '~/utils/testimonials'

/** The review's visibility draft and the save its leaf commits through. */
export interface ReviewEditor {
  form: Reactive<{ status: TestimonialStatus }>
  saving: Ref<boolean>
  saveDisabled: Ref<boolean>
  errorMessage: Ref<string>
  revert: () => void
  save: () => Promise<void>
}

export const reviewEditorKey = Symbol('review-editor') as InjectionKey<ReviewEditor>
</script>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { getErrorMessage } from '~/utils/errors'

/** Set when this is a location's review rather than the site's. */
const props = defineProps<{ locationId?: string }>()

const route = useRoute()
const dashboardApi = useDashboardApi()
const level = useRouteLevel()
const organizationId = await useDashboardOrganizationId()

const reviewId = computed(() => String(route.params.reviewId ?? ''))
const recordPath = computed(() => props.locationId
  ? `/dashboard/${String(route.params.orgSlug)}/locations/${String(route.params.locationSlug)}/qa/reviews/${reviewId.value}`
  : `/dashboard/${String(route.params.orgSlug)}/qa/reviews/${reviewId.value}`)
// The list this review is a row of, so a moderated review reads the same in both.
const listKey = computed(() => props.locationId
  ? `dashboard-location-reviews-${organizationId}-${props.locationId}`
  : `dashboard-organization-reviews-${organizationId}`)

const form = useState(`review-draft-${organizationId}-${props.locationId ?? 'organization'}-${reviewId.value}`, () => ({ status: 'pending' as TestimonialStatus })).value
const saving = ref(false)
const errorMessage = ref('')

// Reviews are listed per scope, so the record is found in its list.
const { data, refresh } = await useAsyncData(
  () => `dashboard-review-record-${organizationId}-${props.locationId ?? 'organization'}-${reviewId.value}`,
  () => dashboardApi<{ reviews: OrganizationTestimonial[] }>(`/api/editor/organizations/${organizationId}/reviews`, {
    query: props.locationId ? { location_id: props.locationId } : undefined,
    validate: isTestimonialsResponse,
  }),
  { server: false },
)

const record = computed(() => data.value?.reviews.find(row => row.id === reviewId.value) ?? null)
// A review that is not there is not a page, so it 404s rather than rendering an empty record.
watchEffect(() => {
  if (data.value && !record.value) showError(createError({ statusCode: 404, statusMessage: 'Review not found' }))
})
watch(record, (row) => { if (row) form.status = row.status }, { immediate: true })

const navigationGroups = computed<EditorNavigationGroup[]>(() => [
  {
    id: 'review',
    items: [
      { id: 'visibility', label: 'Visibility', summary: record.value ? REVIEW_STATUS_LABELS[form.status] : 'Loading', icon: 'i-lucide-eye', to: `${recordPath.value}/visibility` },
    ],
  },
])

// A guest review arrives pending; the owner's decision is publish or archive, never back to pending.
const saveDisabled = computed(() => !record.value || form.status === record.value.status || form.status === 'pending')

async function save() {
  const row = record.value
  if (!row) return
  saving.value = true
  errorMessage.value = ''
  try {
    const status = form.status
    await dashboardApi(`/api/editor/organizations/${organizationId}/reviews/${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      body: { status },
      validate: (value): value is { review_id: string; status: TestimonialStatus } =>
        isRecord(value) && value.review_id === row.id && value.status === status,
    })
    await Promise.all([refresh(), refreshNuxtData(listKey.value)])
    await level.close()
  } catch (error) {
    errorMessage.value = getErrorMessage(error, 'Review could not be updated')
  } finally {
    saving.value = false
  }
}

/** A cancelled leaf puts the stored status back before it closes. */
function revert() {
  if (record.value) form.status = record.value.status
}

provide(reviewEditorKey, { form, saving, saveDisabled, errorMessage, revert, save })

useSeoMeta({ title: 'Review | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
