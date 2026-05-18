<template>
  <UPage>
    <UPageHeader title="Inbox" description="Guest contact messages and reservation requests in one place.">
      <template #links>
        <DashboardSiteHeaderLinks :links="headerLinks" />
      </template>
    </UPageHeader>

    <UPageBody>
      <UTabs v-model="activeTab" :items="tabs" class="mb-4" />

      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="i in 5" :key="i" class="h-24 rounded-lg" />
      </div>

      <div v-else-if="activeTab === 'contact'" class="space-y-3">
        <div v-if="contacts.length === 0" class="rounded-lg border border-dashed border-default px-6 py-12 text-center">
          <UIcon name="i-heroicons-inbox" class="mx-auto size-9 text-muted" />
          <p class="mt-3 text-sm font-medium text-highlighted">No contact messages yet</p>
        </div>
        <div v-for="submission in contacts" :key="submission.id" class="rounded-lg border border-default bg-default p-4">
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
              <UButton :to="`mailto:${submission.email}`" icon="i-heroicons-envelope" color="neutral" variant="soft" size="sm">Reply</UButton>
              <UButton size="sm" color="neutral" variant="ghost" @click="updateContactStatus(submission, 'replied')">Mark replied</UButton>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="space-y-3">
        <div v-if="reservations.length === 0" class="rounded-lg border border-dashed border-default px-6 py-12 text-center">
          <UIcon name="i-heroicons-calendar-days" class="mx-auto size-9 text-muted" />
          <p class="mt-3 text-sm font-medium text-highlighted">No reservation requests yet</p>
        </div>
        <div v-for="reservation in reservations" :key="reservation.id" class="rounded-lg border border-default bg-default p-4">
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
              <UButton :to="`mailto:${reservation.email}`" icon="i-heroicons-envelope" color="neutral" variant="soft" size="sm">Reply</UButton>
            </div>
          </div>
        </div>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
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

const route = useRoute()
const siteId = route.params.siteId as string
const toast = useToast()
const sitePublicUrl = ref<string | null>(null)
const contacts = ref<ContactSubmission[]>([])
const reservations = ref<ReservationSubmission[]>([])
const loading = ref(true)
const activeTab = ref('contact')
const { paths, buildHeaderLinks } = useDashboardSiteLinks(siteId, sitePublicUrl)

const tabs = computed(() => [
  { label: `Contact (${contacts.value.length})`, value: 'contact', icon: 'i-heroicons-envelope' },
  { label: `Reservations (${reservations.value.length})`, value: 'reservations', icon: 'i-heroicons-calendar-days' }
])

const headerLinks = computed(() => buildHeaderLinks([
  { label: 'Reservations', icon: 'i-heroicons-calendar-days', to: paths.value.reservations, color: 'neutral' as const, variant: 'soft' as const }
]))

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

async function loadInbox() {
  loading.value = true
  try {
    const [settingsRes, contactRes, reservationRes] = await Promise.all([
      $fetch<{ settings: { public_url: string | null } }>(`/api/sites/${siteId}/settings`),
      $fetch<{ submissions: ContactSubmission[] }>(`/api/editor/sites/${siteId}/contact-submissions`),
      $fetch<{ submissions: ReservationSubmission[] }>(`/api/editor/sites/${siteId}/reservation-submissions`)
    ])
    sitePublicUrl.value = settingsRes.settings.public_url
    contacts.value = contactRes.submissions ?? []
    reservations.value = reservationRes.submissions ?? []
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load inbox', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function updateContactStatus(submission: ContactSubmission, status: 'new' | 'read' | 'replied') {
  try {
    await $fetch(`/api/editor/sites/${siteId}/contact-submissions/${submission.id}`, {
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
    await $fetch(`/api/editor/sites/${siteId}/reservation-submissions/${submission.id}`, {
      method: 'PATCH',
      body: { status }
    })
    submission.status = status
    toast.add({ description: 'Reservation status updated', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update reservation status', color: 'error' })
  }
}

onMounted(loadInbox)
useSeoMeta({ title: 'Inbox | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
