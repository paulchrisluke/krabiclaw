<template>
  <div>
    <h1 class="text-2xl font-extrabold tracking-tight text-default mb-2">Your bookings</h1>
    <p class="text-sm text-muted mb-8">
      Booking history and loyalty status across every site where you've made a reservation or booking.
    </p>

    <div v-if="pending" class="text-sm text-muted">Loading…</div>

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
// same server util the API route uses, directly against cloudflareEnv(event).db.
const requestEvent = useRequestEvent()
const { data, pending } = await useAsyncData('account-bookings', async () => {
  if (import.meta.server) {
    if (!requestEvent) return { customers: [] }
    const [{ cloudflareEnv }, { getAuthSession }, { listLinkedCustomersForUser }] = await Promise.all([
      import('~/server/utils/api-response'),
      import('~/server/utils/auth'),
      import('~/server/utils/guest-claims'),
    ])
    const env = cloudflareEnv(requestEvent)
    const session = await getAuthSession(requestEvent, env)
    if (!session?.user?.id || !env.db) return { customers: [] }
    const customers = await listLinkedCustomersForUser(env.db, session.user.id)
    return { customers }
  }
  return await $fetch('/api/account/bookings').catch(() => ({ customers: [] }))
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
