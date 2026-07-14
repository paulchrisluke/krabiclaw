<template>
  <div>
    <h1 class="text-2xl font-extrabold tracking-tight text-default mb-2">Link a booking history</h1>
    <p class="text-sm text-muted mb-8">
      We matched these unclaimed booking records to your verified email. Confirm the ones that are
      yours — we'll email a one-time link to finish linking each one.
    </p>

    <div v-if="pending" class="text-sm text-muted">Loading…</div>

    <div v-else-if="!claimable.length" class="rounded-xl border border-default bg-elevated/40 p-6 text-sm text-muted">
      No unclaimed bookings match your account email.
    </div>

    <ul v-else class="space-y-4">
      <li v-for="candidate in claimable" :key="candidate.customerId" class="rounded-xl border border-default bg-elevated/40 p-5 flex items-center justify-between gap-4">
        <div>
          <p class="font-semibold text-default">{{ candidate.siteName }}</p>
          <p class="text-xs text-muted">{{ candidate.organizationName }}</p>
        </div>
        <PlatformButton
          size="sm"
          :loading="requesting === candidate.customerId"
          :disabled="sent.has(candidate.customerId)"
          @click="requestClaim(candidate.customerId)"
        >
          {{ sent.has(candidate.customerId) ? 'Email sent' : 'This is mine' }}
        </PlatformButton>
      </li>
    </ul>

    <div v-if="error" role="alert" class="mt-6 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-500">{{ error }}</div>
    <div v-if="notice" role="status" class="mt-6 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-600">{{ notice }}</div>
  </div>
</template>

<script setup>
definePageMeta({ layout: 'account', middleware: 'account' })

const requestEvent = useRequestEvent()
const { data, pending } = await useAsyncData('account-claimable', async () => {
  if (import.meta.server) {
    if (!requestEvent) return { claimable: [] }
    const [{ cloudflareEnv }, { getAuthSession }, { findClaimableCustomersForEmail }] = await Promise.all([
      import('~/server/utils/api-response'),
      import('~/server/utils/auth'),
      import('~/server/utils/guest-claims'),
    ])
    const env = cloudflareEnv(requestEvent)
    const session = await getAuthSession(requestEvent, env)
    if (!session?.user?.id || !session.user.emailVerified || !env.db) return { claimable: [] }
    const claimable = await findClaimableCustomersForEmail(env.db, session.user.email)
    return { claimable }
  }
  return await $fetch('/api/account/claims').catch(() => ({ claimable: [] }))
})

const claimable = computed(() => data.value?.claimable ?? [])
const requesting = ref(null)
const sent = ref(new Set())
const error = ref(null)
const notice = ref(null)

async function requestClaim(customerId) {
  requesting.value = customerId
  error.value = null
  notice.value = null
  try {
    const result = await $fetch('/api/account/claims', {
      method: 'POST',
      body: { customerId },
    })
    if (result?.ok) {
      sent.value = new Set([...sent.value, customerId])
      notice.value = 'Check your email for a link to confirm and finish linking this booking history.'
    }
  } catch (err) {
    error.value = err?.data?.error ?? 'Could not start the claim. Please try again.'
  } finally {
    requesting.value = null
  }
}
</script>
