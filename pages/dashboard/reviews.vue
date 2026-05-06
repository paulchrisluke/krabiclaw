<template>
    <div class="space-y-8">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">Review Moderation</h1>
        <p class="text-stone-400 mt-2">Approve guest reviews before they appear on menu detail pages and in review schema.</p>
      </div>

      <!-- Status Filters -->
      <UCard>
        <h2 class="font-bold text-gray-900 mb-4">Filter by Status</h2>
        <UTabs v-model="selectedStatus" :items="statusTabItems" class="w-full" />
      </UCard>

      <!-- Reviews List -->
      <UCard>
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="font-bold text-gray-900">{{ currentStatusLabel }}</h2>
            <p class="text-sm text-stone-400 mt-1">
              {{ reviews.length }} {{ reviews.length === 1 ? 'review' : 'reviews' }}
            </p>
          </div>
        </div>

        <!-- Authentication Required -->
        <UAlert v-if="!session.authenticated" color="amber" variant="soft" class="mb-4">
          <template #title>Authentication Required</template>
          <template #description>Sign in to load reviews. The moderation API stays locked until Google verifies the admin account.</template>
        </UAlert>

        <!-- No Reviews -->
        <UEmpty v-else-if="reviews.length === 0" icon="i-heroicons-document-text" class="my-8">
          <template #title>No {{ selectedStatus }} reviews</template>
          <template #description>New guest submissions appear here as pending.</template>
        </UEmpty>

        <!-- Reviews Table -->
        <UCard v-else>
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-stone-200">
                  <th class="text-left text-sm font-medium text-stone-400 pb-3">Author</th>
                  <th class="text-left text-sm font-medium text-stone-400 pb-3">Menu Item</th>
                  <th class="text-left text-sm font-medium text-stone-400 pb-3">Rating</th>
                  <th class="text-left text-sm font-medium text-stone-400 pb-3">Title</th>
                  <th class="text-left text-sm font-medium text-stone-400 pb-3">Content</th>
                  <th class="text-left text-sm font-medium text-stone-400 pb-3">Date</th>
                  <th class="text-left text-sm font-medium text-stone-400 pb-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="review in reviews" :key="review.id" class="border-b border-stone-100 hover:bg-stone-50">
                  <td class="py-3">
                    <div class="text-sm font-medium text-gray-900">{{ review.author }}</div>
                  </td>
                  <td class="py-3">
                    <div class="text-sm text-stone-600">{{ menuItemName(review.menuItemSlug) }}</div>
                  </td>
                  <td class="py-3">
                    <UBadge color="amber" variant="soft" size="xs">
                      {{ review.rating }} / 5
                    </UBadge>
                  </td>
                  <td class="py-3">
                    <div class="text-sm font-medium text-gray-900">{{ review.title }}</div>
                  </td>
                  <td class="py-3">
                    <div class="text-sm text-gray-600 max-w-xs truncate">{{ review.content }}</div>
                  </td>
                  <td class="py-3">
                    <div class="text-sm text-stone-500">{{ formatDate(review.createdAt) }}</div>
                  </td>
                  <td class="py-3">
                    <div class="flex gap-1">
                      <UButton
                        v-if="review.status !== 'approved'"
                        :disabled="updatingId === review.id"
                        color="green"
                        size="xs"
                        @click="updateReview(review.id, 'approved')"
                      >
                        Approve
                      </UButton>
                      <UButton
                        v-if="review.status !== 'rejected'"
                        :disabled="updatingId === review.id"
                        color="red"
                        size="xs"
                        @click="updateReview(review.id, 'rejected')"
                      >
                        Reject
                      </UButton>
                      <UButton
                        v-if="review.status !== 'pending'"
                        :disabled="updatingId === review.id"
                        variant="outline"
                        size="xs"
                        @click="updateReview(review.id, 'pending')"
                      >
                        Pending
                      </UButton>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </UCard>
  </div>
</template>

<script setup>
import { useAuth } from '~/composables/useAuth'

definePageMeta({ layout: 'dashboard' })
import { menuData } from '~/data/menu'

const { data: sessionData, isPending: sessionLoading } = useAuth()
const session = computed(() => sessionData.value?.session)
const isAuthenticated = computed(() => !!sessionData.value?.user)

const selectedStatus = ref('pending')
const reviews = ref([])
const updatingId = ref('')

const statusOptions = [
  { value: 'pending', label: 'Pending', description: 'Needs a decision' },
  { value: 'approved', label: 'Approved', description: 'Visible publicly' },
  { value: 'rejected', label: 'Rejected', description: 'Hidden from menu' }
]

const currentStatusLabel = computed(() =>
  statusOptions.find(option => option.value === selectedStatus.value)?.label ?? 'Reviews'
)

const statusTabItems = computed(() =>
  statusOptions.map(option => ({
    label: option.label,
    value: option.value,
    description: option.description
  }))
)

const menuItemsBySlug = computed(() => {
  const entries = menuData.categories.flatMap(category =>
    category.items.map(item => [item.slug, `${item.name} (${category.name})`])
  )
  return Object.fromEntries(entries)
})

const menuItemName = slug => menuItemsBySlug.value[slug] ?? slug

const formatDate = value =>
  new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))

const loadReviews = async () => {
  if (!isAuthenticated.value) return

  try {
    const response = await $fetch('/api/dashboard/reviews', {
      query: { status: selectedStatus.value }
    })
    reviews.value = response.reviews ?? []
  } catch (fetchError) {
    reviews.value = []
  }
}

const updateReview = async (id, status) => {
  if (!isAuthenticated.value || updatingId.value) return

  updatingId.value = id

  try {
    await $fetch('/api/dashboard/reviews', {
      method: 'PATCH',
      body: { id, status }
    })
    reviews.value = reviews.value.filter(review => review.id !== id)
  } catch (fetchError) {
    // Error handling
  } finally {
    updatingId.value = ''
  }
}

onMounted(async () => {
  if (isAuthenticated.value) {
    loadReviews()
  }
})

watch(isAuthenticated, (val) => {
  if (val) loadReviews()
})

watch(selectedStatus, () => {
  if (isAuthenticated.value) {
    loadReviews()
  }
})

useSeoMeta({
  title: 'Review Moderation | KrabiClaw Dashboard',
  description: 'Moderate guest reviews for KrabiClaw menu items.',
  robots: 'noindex, nofollow'
})
</script>
