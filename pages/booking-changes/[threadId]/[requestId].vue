<template>
  <main class="platform-theme min-h-screen bg-default px-5 py-12 text-default">
    <div class="mx-auto max-w-xl space-y-6">
      <h1 class="text-2xl font-semibold text-highlighted">Review your {{ noun }} changes</h1>
      <USkeleton v-if="pending" class="h-64 w-full" />
      <UAlert v-else-if="error" color="error" title="Change request unavailable" :description="getErrorMessage(error, 'Check your link or contact your host.')" />
      <template v-else-if="proposal">
        <p class="text-muted">Hi {{ proposal.guestName }}. Your host has requested the following changes.</p>
        <UCard variant="subtle">
          <dl class="space-y-5">
            <div v-for="field in fields" :key="field.label">
              <dt class="font-semibold text-highlighted">{{ field.label }}</dt>
              <dd class="mt-1 text-muted">{{ field.before }} <span aria-hidden="true">→</span> {{ field.after }}</dd>
            </div>
          </dl>
        </UCard>
        <template v-if="proposal.status === 'pending'">
          <p class="text-sm text-muted">Your {{ noun }} stays unchanged unless you accept. To ask a question, reply to the email from your host.</p>
          <UAlert v-if="decisionError" color="error" :description="decisionError" />
          <div class="flex justify-between gap-4">
            <UButton label="Decline changes" color="neutral" variant="outline" :disabled="sending" @click="respond('decline')" />
            <UButton label="Accept changes" :loading="sending" @click="respond('accept')" />
          </div>
        </template>
        <UAlert v-else color="success" :title="proposal.status === 'accepted' ? 'Changes accepted' : 'Changes declined'" :description="proposal.status === 'accepted' ? `Your ${noun} has been updated.` : `Your original ${noun} is unchanged.`" />
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
import { $fetch } from 'ofetch'
import { getErrorMessage } from '~/utils/errors'
import type { respondToBookingChange } from '~/server/domain/guest-threads/booking-changes'

definePageMeta({ layout: false })
useSeoMeta({ title: 'Review reservation changes', robots: 'noindex, nofollow', referrer: 'no-referrer' })
type Proposal = Awaited<ReturnType<typeof respondToBookingChange>>
const route = useRoute()
const endpoint = `/api/public/booking-changes/${encodeURIComponent(String(route.params.threadId))}/${encodeURIComponent(String(route.params.requestId))}`
const token = computed(() => route.hash.slice(1))
const { data: proposal, pending, error } = await useAsyncData(endpoint, () => $fetch<Proposal>(endpoint, { headers: { authorization: `Bearer ${token.value}` } }), { server: false })
// The server resolves the noun from the tenant's vertical and sends it with the
// proposal, so this page and the email that linked here agree.
const noun = computed(() => proposal.value?.noun ?? 'booking')
const sending = ref(false)
const decisionError = ref('')
const fields = computed(() => proposal.value ? [
  { label: 'Location', before: proposal.value.originalLocationTitle, after: proposal.value.locationTitle },
  { label: 'Date', before: formatDate(proposal.value.before.bookingDate), after: formatDate(proposal.value.after.bookingDate) },
  { label: 'Time', before: proposal.value.before.bookingTime, after: proposal.value.after.bookingTime },
  { label: 'Guests', before: String(proposal.value.before.partySize), after: String(proposal.value.after.partySize) },
] : [])
async function respond(decision: 'accept' | 'decline') {
  if (sending.value) return
  sending.value = true
  decisionError.value = ''
  try {
    proposal.value = await $fetch<Proposal>(endpoint, { method: 'POST', headers: { authorization: `Bearer ${token.value}` }, body: { decision } })
  } catch (cause) {
    decisionError.value = getErrorMessage(cause, 'Your response could not be saved. Please try again.')
  } finally {
    sending.value = false
  }
}
</script>
