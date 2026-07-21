<template>
  <UDashboardPanel id="location-reviews">
    <template #header>
      <UDashboardNavbar title="Reviews">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <USelect v-model="statusFilter" :items="statusItems" value-key="id" label-key="label" class="w-44" />
          <UButton icon="i-lucide-plus" color="primary" variant="soft" :disabled="!currentLocation" @click="startCreate">Add review</UButton>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="loadReviews">Refresh</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>

      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="i in 4" :key="i" class="h-32 rounded-lg" />
      </div>

      <div v-else-if="filteredReviews.length === 0" class="rounded-lg border border-dashed border-default px-6 py-12 text-center">
        <UIcon name="i-lucide-star" class="mx-auto size-9 text-muted" />
        <p class="mt-3 text-sm font-medium text-highlighted">No reviews match these filters</p>
        <p class="mt-1 text-sm text-muted">Manual and Google-synced reviews will appear here.</p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="review in filteredReviews"
          :id="`review-${review.id}`"
          :key="review.id"
          class="rounded-lg border bg-default p-4 transition-colors"
          :class="review.id === highlightedReviewId ? 'border-primary ring-2 ring-primary' : 'border-default'"
        >
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-medium text-highlighted">{{ review.author_name || 'Guest' }}</p>
                <UBadge color="neutral" variant="soft">{{ review.rating }} stars</UBadge>
                <UBadge :color="review.status === 'approved' ? 'success' : review.status === 'rejected' ? 'error' : 'warning'" variant="soft">
                  {{ review.status }}
                </UBadge>
                <UBadge color="neutral" variant="subtle">{{ review.locationTitle }}</UBadge>
                <UBadge color="neutral" variant="subtle">{{ review.helpful_count ?? 0 }} helpful</UBadge>
                <span class="text-xs text-muted">{{ formatDate(review.created_at) }}</span>
              </div>
              <p v-if="review.title" class="mt-3 text-sm font-medium text-highlighted">{{ review.title }}</p>
              <p class="mt-1 text-sm text-muted">{{ review.content }}</p>
              <div v-if="review.owner_reply" class="mt-3 rounded-lg bg-elevated px-3 py-2">
                <p class="text-xs font-medium text-muted">Owner reply</p>
                <p class="mt-1 text-sm text-default">{{ review.owner_reply }}</p>
              </div>
            </div>

            <div class="flex shrink-0 flex-wrap gap-2">
              <UButton v-if="review.status === 'approved'" :to="publicReviewUrl(review)" target="_blank" size="sm" color="neutral" variant="soft" icon="i-lucide-external-link">Public URL</UButton>
              <UButton v-if="review.customer_id" size="sm" color="neutral" variant="soft" icon="i-lucide-user-round" @click="openCustomer(review.customer_id)">Customer</UButton>
              <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-messages-square" @click="startReply(review)">Reply</UButton>
              <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-square-pen" @click="startEdit(review)">Edit</UButton>
              <UButton size="sm" color="success" variant="ghost" icon="i-lucide-check" @click="setStatus(review, 'approved')">Approve</UButton>
              <UButton size="sm" color="error" variant="ghost" icon="i-lucide-eye-off" @click="setStatus(review, 'rejected')">Hide</UButton>
              <UButton size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" @click="deleteReview(review)">Delete</UButton>
            </div>
          </div>
        </div>
      </div>

      <UModal v-model:open="replyOpen" :ui="{ content: 'max-w-xl' }">
        <template #content>
          <div class="p-6">
            <h2 class="text-lg font-semibold text-highlighted">Owner reply</h2>
            <p class="mt-1 text-sm text-muted">{{ activeReview?.author_name || 'Guest' }} at {{ activeReview?.locationTitle }}</p>
            <UTextarea v-model="replyText" class="mt-5" :rows="5" placeholder="Write a helpful, public owner reply..." />
            <div class="mt-5 flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="replyOpen = false">Cancel</UButton>
              <UButton :loading="saving" @click="saveReply">Save reply</UButton>
            </div>
          </div>
        </template>
      </UModal>

      <UModal v-model:open="reviewOpen" :ui="{ content: 'max-w-2xl' }">
        <template #content>
          <div class="p-6">
            <h2 class="text-lg font-semibold text-highlighted">{{ editingReviewId ? 'Edit review' : 'Add review' }}</h2>
            <div class="mt-5 grid gap-4 md:grid-cols-2">
              <UFormField label="Rating">
                <UInputNumber v-model="reviewForm.rating" :min="1" :max="5" :step="1" class="w-full" />
              </UFormField>
              <UFormField label="Guest name">
                <UInput v-model="reviewForm.author_name" />
              </UFormField>
              <UFormField label="Date">
                <UInput v-model="reviewForm.created_at" type="date" />
              </UFormField>
              <UFormField label="Status">
                <USelect v-model="reviewForm.status" :items="statusItemsWithoutAll" value-key="id" label-key="label" />
              </UFormField>
              <UFormField label="Title">
                <UInput v-model="reviewForm.title" />
              </UFormField>
            </div>
            <UFormField class="mt-4" label="Review">
              <UTextarea v-model="reviewForm.content" :rows="5" />
            </UFormField>
            <div class="mt-5 flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="reviewOpen = false">Cancel</UButton>
              <UButton :loading="saving" :disabled="!canSaveReview" @click="saveReview">Save review</UButton>
            </div>
          </div>
        </template>
      </UModal>

      <UModal v-model:open="customerOpen" :ui="{ content: 'max-w-3xl' }">
        <template #content>
          <div class="p-6">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h2 class="text-lg font-semibold text-highlighted">{{ customerPanel?.customer.name || customerPanel?.customer.email || 'Customer' }}</h2>
                <p class="mt-1 text-sm text-muted">{{ customerPanel?.customer.email || 'No email' }}<span v-if="customerPanel?.customer.phone"> / {{ customerPanel.customer.phone }}</span></p>
              </div>
              <UBadge v-if="customerPanel?.customer.review_request_opted_out_at" color="warning" variant="soft">Opted out</UBadge>
            </div>

            <div v-if="customerLoading" class="mt-6 space-y-3">
              <USkeleton v-for="i in 3" :key="i" class="h-16 rounded-lg" />
            </div>
            <div v-else-if="customerPanel" class="mt-6 grid gap-4 md:grid-cols-2">
              <UCard variant="soft">
                <p class="text-xs font-medium uppercase tracking-wide text-muted">Account</p>
                <p class="mt-2 text-sm text-default">Auth user: {{ customerPanel.customer.user_id || 'Not linked' }}</p>
                <p class="mt-1 text-sm text-default">Stripe: {{ customerPanel.customer.stripe_customer_id || 'None' }}</p>
                <p class="mt-1 text-sm text-default">Source: {{ customerPanel.customer.source }}</p>
              </UCard>
              <UCard variant="soft">
                <p class="text-xs font-medium uppercase tracking-wide text-muted">Review requests</p>
                <p class="mt-2 text-sm text-default">{{ customerPanel.reviewRequests.length }} total</p>
                <p class="mt-1 text-sm text-default">{{ customerPanel.reviewRequests.filter(request => request.submitted_at).length }} submitted</p>
              </UCard>
              <UCard variant="soft">
                <p class="text-xs font-medium uppercase tracking-wide text-muted">Bookings</p>
                <p class="mt-2 text-sm text-default">{{ customerPanel.reservations.length }} reservations</p>
                <p class="mt-1 text-sm text-default">{{ customerPanel.experienceBookings.length }} experience bookings</p>
              </UCard>
              <UCard variant="soft">
                <p class="text-xs font-medium uppercase tracking-wide text-muted">Reviews</p>
                <p class="mt-2 text-sm text-default">{{ customerPanel.reviews.length }} reviews</p>
                <p class="mt-1 text-sm text-default">{{ customerPanel.reviews.filter(review => review.status === 'approved').length }} approved</p>
              </UCard>
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

interface ReviewRow {
  id: string
  location_id: string
  locationTitle: string
  author_name: string | null
  rating: number
  title: string | null
  content: string | null
  owner_reply: string | null
  status: string
  source: string
  helpful_count: number | null
  customer_id: string | null
  booking_id: string | null
  booking_type: string | null
  review_request_id: string | null
  created_at: string
}

interface CustomerPanel {
  customer: {
    id: string
    name: string | null
    email: string | null
    phone: string | null
    source: string
    user_id: string | null
    stripe_customer_id: string | null
    review_request_opted_out_at: string | null
  }
  reservations: ApiRecord[]
  experienceBookings: ApiRecord[]
  reviews: ApiRecord[]
  reviewRequests: ApiRecord[]
}

const siteId = await useDashboardSiteId()
const toast = useToast()
const route = useRoute()
const dashboardLocation = useDashboardLocation()
const reviews = ref<ReviewRow[]>([])
const loading = ref(true)
const saving = ref(false)
const statusFilter = ref('all')
const replyOpen = ref(false)
const reviewOpen = ref(false)
const customerOpen = ref(false)
const customerLoading = ref(false)
const replyText = ref('')
const activeReview = ref<ReviewRow | null>(null)
const customerPanel = ref<CustomerPanel | null>(null)
const editingReviewId = ref<string | null>(null)
const reviewForm = reactive({
  location_id: '',
  author_name: '',
  rating: 5 as number,
  title: '',
  content: '',
  status: 'approved',
  created_at: new Date().toISOString().slice(0, 10)
})
const currentLocation = computed(() => dashboardLocation.currentLocation.value)

const statusItems = [
  { id: 'all', label: 'All statuses' },
  { id: 'approved', label: 'Approved' },
  { id: 'pending', label: 'Pending' },
  { id: 'rejected', label: 'Hidden' }
]

const statusItemsWithoutAll = statusItems.filter(item => item.id !== 'all')

const canSaveReview = computed(() =>
  Boolean(currentLocation.value?.id && reviewForm.author_name.trim() && reviewForm.content.trim() && reviewForm.rating >= 1 && reviewForm.rating <= 5)
)

const filteredReviews = computed(() => reviews.value.filter((review) => {
  const statusMatches = statusFilter.value === 'all' || review.status === statusFilter.value
  return statusMatches
}))

const highlightedReviewId = computed(() => typeof route.query.reply === 'string' ? route.query.reply : null)

function scrollToHighlightedReview() {
  const reviewId = highlightedReviewId.value
  if (!reviewId) return
  nextTick(() => {
    document.getElementById(`review-${reviewId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function publicReviewUrl(review: ReviewRow) {
  const slug = currentLocation.value?.slug || ''
  return slug ? `/locations/${slug}/reviews/${review.id}` : `/reviews`
}

async function loadReviews() {
  if (!currentLocation.value?.id) {
    reviews.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const res = await $fetch<{ reviews: Omit<ReviewRow, 'locationTitle'>[] }>(`/api/dashboard/locations/${currentLocation.value.id}/reviews`)
    reviews.value = (res.reviews ?? []).map(review => ({ ...review, locationTitle: currentLocation.value?.title ?? 'Location' }))
    scrollToHighlightedReview()
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load reviews', color: 'error' })
  } finally {
    loading.value = false
  }
}

function startReply(review: ReviewRow) {
  activeReview.value = review
  replyText.value = review.owner_reply ?? ''
  replyOpen.value = true
}

async function openCustomer(customerId: string) {
  customerOpen.value = true
  customerLoading.value = true
  customerPanel.value = null
  try {
    customerPanel.value = await $fetch<CustomerPanel>(`/api/editor/sites/${siteId}/customers/${customerId}`)
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load customer', color: 'error' })
    customerOpen.value = false
  } finally {
    customerLoading.value = false
  }
}

function resetReviewForm(locationId = currentLocation.value?.id ?? '') {
  editingReviewId.value = null
  reviewForm.location_id = locationId
  reviewForm.author_name = ''
  reviewForm.rating = 5
  reviewForm.title = ''
  reviewForm.content = ''
  reviewForm.status = 'approved'
  reviewForm.created_at = new Date().toISOString().slice(0, 10)
}

function startCreate() {
  resetReviewForm()
  reviewOpen.value = true
}

function startEdit(review: ReviewRow) {
  editingReviewId.value = review.id
  reviewForm.location_id = review.location_id
  reviewForm.author_name = review.author_name ?? ''
  reviewForm.rating = review.rating
  reviewForm.title = review.title ?? ''
  reviewForm.content = review.content ?? ''
  reviewForm.status = review.status
  reviewForm.created_at = review.created_at ? review.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
  reviewOpen.value = true
}

async function saveReply() {
  if (!activeReview.value) return
  saving.value = true
  try {
    await $fetch(`/api/dashboard/editor/reviews/${activeReview.value.id}`, {
      method: 'PATCH',
      body: { owner_reply: replyText.value || null }
    })
    activeReview.value.owner_reply = replyText.value || null
    replyOpen.value = false
    toast.add({ description: 'Reply saved', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to save reply', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function setStatus(review: ReviewRow, status: 'approved' | 'rejected') {
  try {
    await $fetch(`/api/dashboard/editor/reviews/${review.id}`, {
      method: 'PATCH',
      body: { status }
    })
    review.status = status
    toast.add({ description: status === 'approved' ? 'Review approved' : 'Review hidden', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update review', color: 'error' })
  }
}

async function saveReview() {
  if (!canSaveReview.value || !currentLocation.value?.id) return
  saving.value = true
  try {
    const body = {
      author_name: reviewForm.author_name,
      rating: Number(reviewForm.rating),
      title: reviewForm.title || null,
      content: reviewForm.content,
      status: reviewForm.status,
      created_at: reviewForm.created_at || new Date().toISOString().slice(0, 10)
    }

    if (editingReviewId.value) {
      await $fetch(`/api/dashboard/locations/${currentLocation.value.id}/reviews/${editingReviewId.value}`, {
        method: 'PATCH',
        body
      })
      toast.add({ description: 'Review updated', color: 'success' })
    } else {
      await $fetch(`/api/dashboard/locations/${currentLocation.value.id}/reviews`, {
        method: 'POST',
        body
      })
      toast.add({ description: 'Review added', color: 'success' })
    }
    reviewOpen.value = false
    await loadReviews()
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to save review', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function deleteReview(review: ReviewRow) {
  if (!confirm(`Delete review from ${review.author_name || 'Guest'}? This cannot be undone.`)) return
  try {
    await $fetch(`/api/dashboard/locations/${review.location_id}/reviews/${review.id}`, { method: 'DELETE' })
    reviews.value = reviews.value.filter(item => item.id !== review.id)
    toast.add({ description: 'Review deleted', color: 'neutral' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to delete review', color: 'error' })
  }
}

onMounted(async () => {
  await loadReviews()
})
watch(() => currentLocation.value?.id, () => {
  reviewOpen.value = false
  replyOpen.value = false
  editingReviewId.value = null
  void loadReviews()
})
useSeoMeta({ title: 'Reviews | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
