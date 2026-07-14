<template>
  <div>
    <h1 class="text-2xl font-extrabold tracking-tight text-default mb-2">Your bookings</h1>
    <p class="text-sm text-muted mb-8">
      Booking history and loyalty status across every site where you've made a reservation or booking.
    </p>

    <div v-if="pending" class="text-sm text-muted">Loading…</div>

    <div v-else-if="loadError" role="alert" class="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">
      Could not load your bookings. Please refresh the page.
    </div>

    <div v-else-if="!customers.length" class="rounded-xl border border-default bg-elevated/40 p-6 text-sm text-muted">
      No linked bookings yet. If you've booked somewhere before signing up,
      <NuxtLink to="/account/claims" class="text-primary underline">link your booking history</NuxtLink>.
    </div>

    <ul v-else class="space-y-4">
      <li v-for="customer in customers" :key="customer.customerId" class="rounded-xl border border-default bg-elevated/40 p-5">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="font-semibold text-default">{{ customer.siteName }}</p>
            <p class="text-xs text-muted">{{ customer.organizationName }}</p>
          </div>
          <div class="text-right text-xs text-muted">
            <p v-if="customer.loyaltyPointsBalance">{{ customer.loyaltyPointsBalance }} loyalty points</p>
            <p v-if="customer.lastBookingAt">Last booking {{ formatDate(customer.lastBookingAt) }}</p>
          </div>
        </div>
        <div class="mt-3 flex gap-4 text-sm text-muted">
          <span>{{ customer.upcomingReservationCount }} upcoming reservation(s)</span>
          <span>{{ customer.upcomingExperienceBookingCount }} upcoming experience booking(s)</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'account', middleware: 'account' })

// Server-side detail fetch: bypass the internal self-fetch entirely per
// CLAUDE.md's "Nested SSR self-fetch loses Cloudflare bindings" rule — call the
// exact same resolver GET /api/account/bookings uses, directly against the
// request event, instead of re-implementing its auth+query logic (and risking
// the two drifting, as previously happened with the D1 binding name).
const requestEvent = useRequestEvent()
const { data, pending, error: loadError } = await useAsyncData('account-bookings', async () => {
  if (import.meta.server) {
    if (!requestEvent) return { customers: [] }
    const { resolveLinkedCustomersForEvent } = await import('~/server/utils/account-surface')
    const result = await resolveLinkedCustomersForEvent(requestEvent)
    return { customers: result.status === 'ok' ? result.data : [] }
  }
  return await $fetch('/api/account/bookings')
})

const customers = computed(() => data.value?.customers ?? [])

function formatDate(value) {
  try {
    return new Date(value).toLocaleDateString()
  } catch {
    return value
  }
}
</script>
