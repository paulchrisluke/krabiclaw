<template>
  <UDashboardPanel id="location-reservations">
    <template #header>
      <UDashboardNavbar title="Reservations">
        <template #leading>
          <DashboardSidebarCollapseButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mb-4 grid gap-3 md:grid-cols-3">
        <UCard variant="soft">
          <p class="text-sm text-muted">New requests</p>
          <p class="mt-2 text-3xl font-semibold text-highlighted">{{ newCount }}</p>
        </UCard>
        <UCard variant="soft">
          <p class="text-sm text-muted">Confirmed</p>
          <p class="mt-2 text-3xl font-semibold text-highlighted">{{ confirmedCount }}</p>
        </UCard>
        <UCard variant="soft">
          <p class="text-sm text-muted">Total</p>
          <p class="mt-2 text-3xl font-semibold text-highlighted">{{ reservations.length }}</p>
        </UCard>
      </div>

      <UAlert
        v-if="!loading && notificationPhoneMissing"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Booking alerts are email-only right now"
        description="No manager alert number is set for this location, so new reservations are only emailed to the account owner — easy to miss. Add a number to also get them by WhatsApp."
        class="mb-4"
      >
        <template #actions>
          <UButton :to="locationSettingsPath" color="warning" size="xs">Add alert number</UButton>
        </template>
      </UAlert>

      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="i in 5" :key="i" class="h-24 rounded-lg" />
      </div>

      <UCard v-else-if="reservations.length === 0" variant="soft" class="border-dashed">
        <UIcon name="i-lucide-calendar-days" class="mx-auto size-9 text-muted" />
        <p class="mt-3 text-sm font-medium text-highlighted">No reservation requests yet</p>
      </UCard>

      <UCard v-else variant="soft">
        <div v-for="reservation in reservations" :key="reservation.id" class="flex flex-col gap-3 border-b border-default p-4 last:border-0 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium text-highlighted">{{ reservation.name }}</p>
              <UBadge :color="reservation.status === 'confirmed' ? 'success' : reservation.status === 'cancelled' ? 'error' : 'warning'" variant="soft">
                {{ reservation.status }}
              </UBadge>
            </div>
            <p class="mt-1 text-sm text-muted">{{ reservation.date }} at {{ reservation.time }} · {{ reservation.guests }} guests</p>
            <p class="mt-1 text-sm text-muted">{{ reservation.email }} · {{ reservation.phone }}</p>
            <p v-if="reservation.completed_at" class="mt-1 text-xs text-muted">
              Completed {{ formatDateTime(reservation.completed_at) }}
              <span v-if="reservation.review_request_sent_at">· review requested {{ formatDateTime(reservation.review_request_sent_at) }}</span>
              <span v-if="reservation.review_reminder_sent_at">· reminder sent {{ formatDateTime(reservation.review_reminder_sent_at) }}</span>
            </p>
            <p v-if="reservation.requests" class="mt-2 text-sm text-default">{{ reservation.requests }}</p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <UButton size="sm" color="success" variant="ghost" @click="updateReservationStatus(reservation, 'confirmed')">Confirm</UButton>
            <UButton size="sm" color="neutral" variant="ghost" @click="updateReservationStatus(reservation, 'completed')">Complete</UButton>
            <UButton size="sm" color="primary" variant="soft" :disabled="!reservation.completed_at || Boolean(reservation.review_request_sent_at)" @click="sendReviewRequest(reservation, 'first')">Ask review</UButton>
            <UButton size="sm" color="primary" variant="ghost" :disabled="!reservation.review_request_sent_at || Boolean(reservation.review_reminder_sent_at) || Boolean(reservation.review_submitted_at)" @click="sendReviewRequest(reservation, 'reminder')">Reminder</UButton>
            <UButton size="sm" color="error" variant="ghost" @click="updateReservationStatus(reservation, 'cancelled')">Cancel</UButton>
            <UButton :to="`mailto:${reservation.email}`" icon="i-lucide-mail" color="neutral" variant="soft" size="sm">Reply</UButton>
          </div>
        </div>
      </UCard>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

interface ReservationSubmission {
  id: string
  location_id: string
  location_title: string | null
  name: string
  email: string
  phone: string
  date: string
  time: string
  guests: string
  requests: string | null
  status: string
  completed_at: string | null
  completion_source: string | null
  review_request_sent_at: string | null
  review_reminder_sent_at: string | null
  review_submitted_at: string | null
  review_id: string | null
}

const siteId = await useDashboardSiteId()
const toast = useToast()
const route = useRoute()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
if (!dashboard.state.value) await dashboard.refresh()
const reservations = ref<ReservationSubmission[]>([])
const loading = ref(true)
const notificationPhoneMissing = ref(false)
const currentLocationId = computed(() => dashboardLocation.currentLocationId.value)
const currentLocationSlug = computed(() => dashboardLocation.currentLocationSlug.value)

const locationSettingsPath = computed(() =>
  `/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/locations/${currentLocationSlug.value ?? route.params.locationSlug}`
)

const newCount = computed(() => reservations.value.filter(item => item.status === 'new').length)
const confirmedCount = computed(() => reservations.value.filter(item => item.status === 'confirmed').length)

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

async function loadReservations() {
  const locationId = currentLocationId.value
  if (!locationId) {
    reservations.value = []
    notificationPhoneMissing.value = false
    loading.value = false
    return
  }

  loading.value = true
  try {
    const [locationsResult, notificationsResult] = await Promise.allSettled([
      $fetch<{ locations: Array<{ id: string; slug: string; notification_phone: string | null }> }>(`/api/dashboard/locations`),
      $fetch<{ notifications: { whatsapp_phone: string | null; channels: string[] } }>(`/api/dashboard/editor/notifications`),
    ])
    if (locationsResult.status !== 'fulfilled') throw locationsResult.reason
    const current = locationsResult.value.locations.find(loc => loc.id === locationId) ?? null

    const reservationsResult = await $fetch<{ submissions: ReservationSubmission[] }>(`/api/editor/sites/${siteId}/reservation-submissions`, {
      query: { location_id: locationId }
    })
    reservations.value = reservationsResult.submissions ?? []

    if (notificationsResult.status === 'fulfilled') {
      const notifications = notificationsResult.value.notifications
      const effectivePhone = current?.notification_phone || notifications.whatsapp_phone
      const whatsappEnabled = notifications.channels.includes('whatsapp')
      notificationPhoneMissing.value = whatsappEnabled && !effectivePhone
    } else {
      console.warn('reservation_notifications_load_failed', notificationsResult.reason)
    }
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load reservations', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function updateReservationStatus(submission: ReservationSubmission, status: 'new' | 'confirmed' | 'cancelled' | 'completed') {
  try {
    await $fetch(`/api/editor/sites/${siteId}/reservation-submissions/${submission.id}`, {
      method: 'PATCH',
      query: { location_id: submission.location_id },
      body: { status }
    })
    submission.status = status
    if (status === 'completed') {
      submission.completed_at ||= new Date().toISOString()
      submission.completion_source ||= 'manual'
    }
    toast.add({ description: 'Reservation status updated', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update reservation status', color: 'error' })
  }
}

async function sendReviewRequest(submission: ReservationSubmission, kind: 'first' | 'reminder') {
  try {
    await $fetch(`/api/editor/sites/${siteId}/reservation-submissions/${submission.id}/review-request`, {
      method: 'POST',
      body: { kind }
    })
    const now = new Date().toISOString()
    if (kind === 'first') submission.review_request_sent_at = now
    else submission.review_reminder_sent_at = now
    toast.add({ description: kind === 'first' ? 'Review request sent' : 'Review reminder sent', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to send review request', color: 'error' })
  }
}

onMounted(loadReservations)
watch(() => currentLocationId.value, () => {
  void loadReservations()
})
useSeoMeta({ title: 'Reservations | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
