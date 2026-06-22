<template>
  <UPage>

    <UPageBody>
      <div class="mb-4 grid gap-3 md:grid-cols-3">
        <UCard>
          <p class="text-sm text-muted">New requests</p>
          <p class="mt-2 text-3xl font-semibold text-highlighted">{{ newCount }}</p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">Confirmed</p>
          <p class="mt-2 text-3xl font-semibold text-highlighted">{{ confirmedCount }}</p>
        </UCard>
        <UCard>
          <p class="text-sm text-muted">Total</p>
          <p class="mt-2 text-3xl font-semibold text-highlighted">{{ reservations.length }}</p>
        </UCard>
      </div>

      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="i in 5" :key="i" class="h-24 rounded-lg" />
      </div>

      <UCard v-else-if="reservations.length === 0" class="border-dashed" :ui="{ body: 'px-6 py-12 text-center' }">
        <UIcon name="i-heroicons-calendar-days" class="mx-auto size-9 text-muted" />
        <p class="mt-3 text-sm font-medium text-highlighted">No reservation requests yet</p>
      </UCard>

      <UCard v-else :ui="{ body: 'p-0 sm:p-0' }">
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
            <p v-if="reservation.requests" class="mt-2 text-sm text-default">{{ reservation.requests }}</p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <UButton size="sm" color="success" variant="ghost" @click="updateReservationStatus(reservation, 'confirmed')">Confirm</UButton>
            <UButton size="sm" color="neutral" variant="ghost" @click="updateReservationStatus(reservation, 'completed')">Complete</UButton>
            <UButton size="sm" color="error" variant="ghost" @click="updateReservationStatus(reservation, 'cancelled')">Cancel</UButton>
            <UButton :to="`mailto:${reservation.email}`" icon="i-heroicons-envelope" color="neutral" variant="soft" size="sm">Reply</UButton>
          </div>
        </div>
      </UCard>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

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
}

const siteId = await useDashboardSiteId()
const toast = useToast()
const sitePublicUrl = ref<string | null>(null)
const reservations = ref<ReservationSubmission[]>([])
const loading = ref(true)
const { paths, buildHeaderLinks } = useDashboardSiteLinks(siteId, sitePublicUrl)

const _headerLinks = computed(() => buildHeaderLinks([
  { label: 'Edit reservation page', icon: 'i-heroicons-document-text', to: `${paths.value.content}?page=reservations`, color: 'primary' as const, variant: 'soft' as const },
  { label: 'Inbox', icon: 'i-heroicons-inbox', to: paths.value.inbox, color: 'neutral' as const, variant: 'ghost' as const }
]))

const newCount = computed(() => reservations.value.filter(item => item.status === 'new').length)
const confirmedCount = computed(() => reservations.value.filter(item => item.status === 'confirmed').length)

async function loadReservations() {
  loading.value = true
  try {
    const [settingsResult, reservationsResult] = await Promise.allSettled([
      $fetch<{ settings: { public_url: string | null } }>(`/api/dashboard/settings`),
      $fetch<{ submissions: ReservationSubmission[] }>(`/api/dashboard/editor/reservation-submissions`)
    ])
    if (settingsResult.status === 'fulfilled') {
      sitePublicUrl.value = settingsResult.value.settings.public_url
    } else {
      console.warn('reservation_settings_load_failed', settingsResult.reason)
    }
    if (reservationsResult.status === 'fulfilled') {
      reservations.value = reservationsResult.value.submissions ?? []
    } else {
      throw reservationsResult.reason
    }
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load reservations', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function updateReservationStatus(submission: ReservationSubmission, status: 'new' | 'confirmed' | 'cancelled' | 'completed') {
  try {
    await $fetch(`/api/dashboard/editor/reservation-submissions/${submission.id}`, {
      method: 'PATCH',
      body: { status }
    })
    submission.status = status
    toast.add({ description: 'Reservation status updated', color: 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update reservation status', color: 'error' })
  }
}

onMounted(loadReservations)
useSeoMeta({ title: 'Reservations | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
