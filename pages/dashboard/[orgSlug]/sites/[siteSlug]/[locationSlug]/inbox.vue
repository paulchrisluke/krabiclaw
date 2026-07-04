<template>
  <UPage>

    <UPageBody>
      <UTabs v-model="activeTab" :items="tabs" class="mb-4" />

      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="i in 5" :key="i" class="h-24 rounded-lg" />
      </div>

      <div v-else-if="activeTab === 'contact'" class="space-y-3">
        <UCard v-if="contacts.length === 0" :ui="{ root: 'border-dashed', body: 'px-6 py-12 sm:px-6 sm:py-12 text-center' }">
          <UIcon name="i-heroicons-inbox" class="mx-auto size-9 text-muted" />
          <p class="mt-3 text-sm font-medium text-highlighted">No contact messages yet</p>
        </UCard>
        <UCard v-for="submission in contacts" :key="submission.id" :ui="{ body: 'p-4 sm:p-4' }">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-medium text-highlighted">{{ submission.name }}</p>
                <UBadge color="neutral" variant="soft">{{ submission.status }}</UBadge>
                <span class="text-xs text-muted">{{ formatDate(submission.created_at) }}</span>
              </div>
              <p class="mt-1 text-sm text-muted">{{ submission.email }}</p>
              <p class="mt-3 text-sm text-default">{{ submission.message }}</p>
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              <UButton size="sm" color="neutral" variant="ghost" @click="updateContactStatus(submission, 'read')">Mark read</UButton>
              <UButton icon="i-heroicons-chat-bubble-left-right" color="neutral" variant="soft" size="sm" @click="startReply('contact', submission)">Reply</UButton>
              <UButton size="sm" color="neutral" variant="ghost" @click="updateContactStatus(submission, 'replied')">Mark replied</UButton>
            </div>
          </div>
        </UCard>
      </div>

      <div v-else-if="activeTab === 'reservations'" class="space-y-3">
        <UCard v-if="reservations.length === 0" :ui="{ root: 'border-dashed', body: 'px-6 py-12 sm:px-6 sm:py-12 text-center' }">
          <UIcon name="i-heroicons-calendar-days" class="mx-auto size-9 text-muted" />
          <p class="mt-3 text-sm font-medium text-highlighted">No reservation requests yet</p>
        </UCard>
        <UCard v-for="reservation in reservations" :key="reservation.id" :ui="{ body: 'p-4 sm:p-4' }">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-medium text-highlighted">{{ reservation.name }}</p>
                <UBadge :color="reservation.status === 'confirmed' ? 'success' : reservation.status === 'cancelled' ? 'error' : 'warning'" variant="soft">
                  {{ reservation.status }}
                </UBadge>
                <span class="text-xs text-muted">{{ formatDate(reservation.created_at) }}</span>
              </div>
              <p class="mt-1 text-sm text-muted">{{ reservation.date }} at {{ reservation.time }} · {{ reservation.guests }} guests</p>
              <p class="mt-1 text-sm text-muted">{{ reservation.email }} · {{ reservation.phone }}</p>
              <p v-if="reservation.requests" class="mt-3 text-sm text-default">{{ reservation.requests }}</p>
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              <UButton size="sm" color="success" variant="ghost" @click="updateReservationStatus(reservation, 'confirmed')">Confirm</UButton>
              <UButton size="sm" color="neutral" variant="ghost" @click="updateReservationStatus(reservation, 'completed')">Complete</UButton>
              <UButton size="sm" color="error" variant="ghost" @click="updateReservationStatus(reservation, 'cancelled')">Cancel</UButton>
              <UButton icon="i-heroicons-chat-bubble-left-right" color="neutral" variant="soft" size="sm" @click="startReply('reservation', reservation)">Reply</UButton>
            </div>
          </div>
        </UCard>
      </div>

      <div v-else class="space-y-3">
        <UCard v-if="bookings.length === 0" :ui="{ root: 'border-dashed', body: 'px-6 py-12 sm:px-6 sm:py-12 text-center' }">
          <UIcon name="i-heroicons-ticket" class="mx-auto size-9 text-muted" />
          <p class="mt-3 text-sm font-medium text-highlighted">No experience bookings yet</p>
        </UCard>
        <UCard v-for="booking in bookings" :key="booking.id" :ui="{ body: 'p-4 sm:p-4' }">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-medium text-highlighted">{{ booking.guest_name }}</p>
                <UBadge :color="booking.status === 'confirmed' ? 'success' : booking.status === 'cancelled' ? 'error' : 'warning'" variant="soft">
                  {{ booking.status }}
                </UBadge>
                <span class="text-xs text-muted">{{ formatDate(booking.created_at) }}</span>
              </div>
              <p class="mt-1 text-sm text-muted">{{ booking.experience_title }} · {{ booking.booking_date }} at {{ booking.time_slot }} · {{ booking.party_size }} guests</p>
              <p class="mt-1 text-sm text-muted">{{ booking.guest_email }}<span v-if="booking.guest_phone"> · {{ booking.guest_phone }}</span></p>
              <p v-if="booking.notes" class="mt-3 text-sm text-default">{{ booking.notes }}</p>
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              <UButton size="sm" color="success" variant="ghost" @click="updateBookingStatus(booking, 'confirmed')">Confirm</UButton>
              <UButton size="sm" color="error" variant="ghost" @click="updateBookingStatus(booking, 'cancelled')">Cancel</UButton>
              <UButton icon="i-heroicons-chat-bubble-left-right" color="neutral" variant="soft" size="sm" @click="startReply('experience_booking', { id: booking.id, email: booking.guest_email, phone: booking.guest_phone })">Reply</UButton>
            </div>
          </div>
        </UCard>
      </div>

      <UModal v-model:open="replyOpen" :ui="{ content: 'max-w-xl' }">
        <template #content>
          <div class="p-6">
            <h2 class="text-lg font-semibold text-highlighted">Reply to guest</h2>
            <UTabs
              v-if="replyTarget?.phone"
              v-model="replyChannel"
              class="mt-4"
              :items="[
                { label: 'Email', value: 'email', icon: 'i-heroicons-envelope' },
                { label: 'WhatsApp', value: 'whatsapp', icon: 'i-simple-icons-whatsapp' },
              ]"
            />
            <UTextarea v-model="replyText" class="mt-5" :rows="5" placeholder="Write your reply..." />
            <div class="mt-5 flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="replyOpen = false">Cancel</UButton>
              <UButton :loading="replySaving" @click="saveReply">Send reply</UButton>
            </div>
          </div>
        </template>
      </UModal>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
// -nocheck
definePageMeta({ layout: 'dashboard' })

interface ContactSubmission {
  id: string
  name: string
  email: string
  message: string
  status: string
  created_at: string
}

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
  created_at: string
}

interface ExperienceBooking {
  id: string
  experience_title: string | null
  guest_name: string
  guest_email: string
  guest_phone: string | null
  party_size: number
  booking_date: string
  time_slot: string
  status: string
  notes: string | null
  created_at: string
}

type SubmissionKind = 'contact' | 'reservation' | 'experience_booking'

const REPLY_ENDPOINT_SEGMENT: Record<SubmissionKind, string> = {
  contact: 'contact-submissions',
  reservation: 'reservation-submissions',
  experience_booking: 'experience-bookings',
}

const siteId = await useDashboardSiteId()
const toast = useToast()
const route = useRoute()
const sitePublicUrl = ref<string | null>(null)
const contacts = ref<ContactSubmission[]>([])
const reservations = ref<ReservationSubmission[]>([])
const bookings = ref<ExperienceBooking[]>([])
const loading = ref(true)
const activeTab = ref('contact')
const { paths, buildHeaderLinks } = useDashboardSiteLinks(siteId, sitePublicUrl)

const tabs = computed(() => [
  { label: `Site contact (${contacts.value.length})`, value: 'contact', icon: 'i-heroicons-envelope' },
  { label: `Reservations (${reservations.value.length})`, value: 'reservations', icon: 'i-heroicons-calendar-days' },
  { label: `Experience bookings (${bookings.value.length})`, value: 'bookings', icon: 'i-heroicons-ticket' },
])

const _headerLinks = computed(() => buildHeaderLinks([
  { label: 'Reservations', icon: 'i-heroicons-calendar-days', to: paths.value.reservations, color: 'neutral' as const, variant: 'soft' as const }
]))

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

async function loadInbox() {
  loading.value = true
  try {
    const [settingsRes, contactRes, locationsRes] = await Promise.all([
      $fetch<{ settings: { public_url: string | null } }>(`/api/dashboard/settings`),
      $fetch<{ submissions: ContactSubmission[] }>(`/api/dashboard/editor/contact-submissions`),
      $fetch<{ locations: Array<{ id: string; slug: string }> }>(`/api/dashboard/locations`)
    ])
    sitePublicUrl.value = settingsRes.settings.public_url
    contacts.value = contactRes.submissions ?? []
    const current = locationsRes.locations.find(location => location.slug === route.params.locationSlug || location.id === route.params.locationSlug)
    if (!current?.id) throw new Error('Location not found')
    const [reservationRes, bookingRes] = await Promise.all([
      $fetch<{ submissions: ReservationSubmission[] }>(`/api/dashboard/editor/reservation-submissions`, {
        query: { location_id: current.id }
      }),
      $fetch<{ bookings: ExperienceBooking[] }>(`/api/dashboard/editor/experience-bookings`, {
        query: { location_id: current.id }
      })
    ])
    reservations.value = reservationRes.submissions ?? []
    bookings.value = bookingRes.bookings ?? []
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load inbox', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function updateContactStatus(submission: ContactSubmission, status: 'new' | 'read' | 'replied') {
  try {
    await $fetch(`/api/dashboard/editor/contact-submissions/${submission.id}`, {
      method: 'PATCH',
      body: { status }
    })
    submission.status = status
    toast.add({ description: 'Contact status updated', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update contact status', color: 'error' })
  }
}

async function updateReservationStatus(submission: ReservationSubmission, status: 'new' | 'confirmed' | 'cancelled' | 'completed') {
  try {
    await $fetch(`/api/dashboard/editor/reservation-submissions/${submission.id}`, {
      method: 'PATCH',
      query: { location_id: submission.location_id },
      body: { status }
    })
    submission.status = status
    toast.add({ description: 'Reservation status updated', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update reservation status', color: 'error' })
  }
}

async function updateBookingStatus(booking: ExperienceBooking, status: 'pending' | 'confirmed' | 'cancelled') {
  try {
    await $fetch(`/api/dashboard/editor/experience-bookings/${booking.id}`, {
      method: 'PATCH',
      body: { status }
    })
    booking.status = status
    toast.add({ description: 'Booking status updated', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update booking status', color: 'error' })
  }
}

const replyOpen = ref(false)
const replyText = ref('')
const replyChannel = ref<'email' | 'whatsapp'>('email')
const replySaving = ref(false)
const replyTarget = ref<{ kind: SubmissionKind; id: string; email: string; phone: string | null } | null>(null)

function startReply(kind: SubmissionKind, item: { id: string; email: string; phone?: string | null }) {
  replyTarget.value = { kind, id: item.id, email: item.email, phone: item.phone ?? null }
  replyChannel.value = 'email'
  replyText.value = ''
  replyOpen.value = true
}

async function saveReply() {
  if (!replyTarget.value || !replyText.value.trim()) return
  replySaving.value = true
  try {
    const segment = REPLY_ENDPOINT_SEGMENT[replyTarget.value.kind]
    const url: string = `/api/dashboard/editor/${segment}/${replyTarget.value.id}/reply`
    await $fetch(url, {
      method: 'POST',
      body: { channel: replyChannel.value, body: replyText.value }
    })
    toast.add({ description: 'Reply sent', color: 'success' })
    replyOpen.value = false
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to send reply', color: 'error' })
  } finally {
    replySaving.value = false
  }
}

onMounted(loadInbox)
watch(() => route.params.locationSlug, () => {
  void loadInbox()
})
useSeoMeta({ title: 'Inbox | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
