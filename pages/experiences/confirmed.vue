<template>
  <div class="min-h-screen bg-default text-default">
    <div class="mx-auto max-w-xl px-4 pt-16 pb-24 sm:px-6 lg:px-8">
      <template v-if="confirmation">
        <div class="rounded-3xl border border-default bg-elevated p-10 text-center shadow-sm sm:p-12">
          <div class="mb-8 flex justify-center">
            <div class="flex size-20 items-center justify-center rounded-full bg-primary/10">
              <UIcon name="i-heroicons-check-circle" class="size-12 text-primary" />
            </div>
          </div>

          <h1 class="saya-display saya-italic text-4xl text-default">You're booked, {{ confirmation.guestName }}!</h1>
          <p class="mt-4 text-muted">{{ confirmation.message }}</p>

          <div class="mt-8 space-y-2 rounded-2xl border border-default bg-default px-6 py-5 text-left text-sm">
            <p v-if="confirmation.title"><strong class="text-default">Experience:</strong> {{ confirmation.title }}</p>
            <p><strong class="text-default">Date:</strong> {{ readableDate }}</p>
            <p><strong class="text-default">Time:</strong> {{ confirmation.time }}</p>
            <p><strong class="text-default">Guests:</strong> {{ confirmation.guests }}</p>
          </div>

          <div v-if="confirmation.requests" class="mt-6 rounded-2xl border border-default bg-default px-6 py-5 text-left">
            <p class="saya-eyebrow mb-1 text-muted">Special requests</p>
            <p class="text-sm text-default">{{ confirmation.requests }}</p>
          </div>

          <div class="mt-8 flex flex-col gap-3">
            <UButton color="primary" variant="soft" class="rounded-full" @click="share">
              <UIcon name="i-heroicons-share" class="mr-1.5 size-4" />
              Share
            </UButton>
            <UButton
              v-if="confirmation.contactPhone"
              :to="`tel:${confirmation.contactPhone.replace(/\s/g, '')}`"
              color="neutral"
              variant="soft"
              class="rounded-full"
            >
              Call us: {{ confirmation.contactPhone }}
            </UButton>
            <UButton to="/experiences" color="primary" variant="ghost" size="sm">Browse more experiences</UButton>
          </div>
        </div>
      </template>

      <div v-else class="rounded-3xl border border-default bg-muted/20 p-12 text-center">
        <UIcon name="i-heroicons-exclamation-triangle" class="mx-auto size-12 text-error" />
        <h2 class="mt-6 text-xl font-bold">No booking found</h2>
        <p class="mt-2 text-muted">We couldn't find a confirmation to show. Check your email for the details.</p>
        <UButton to="/experiences" color="primary" variant="soft" class="mt-10 rounded-full">Browse experiences</UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getBookingConfirmation, type BookingConfirmation } from '~/composables/useBookingHandoff'

definePageMeta({ layout: 'saya' })

const { formatDate } = useLocaleDate()
const toast = useToast()

const confirmation = ref<BookingConfirmation | null>(null)

onMounted(() => {
  const handoff = getBookingConfirmation()
  confirmation.value = handoff && handoff.type === 'experience' ? handoff : null
})

const readableDate = computed(() => {
  if (!confirmation.value?.date) return ''
  return formatDate(`${confirmation.value.date}T12:00:00`)
})

async function share() {
  if (!confirmation.value) return
  const text = `I'm booked for ${confirmation.value.title ?? confirmation.value.siteName} on ${readableDate.value} at ${confirmation.value.time}.`
  if (import.meta.client && navigator.share) {
    try {
      await navigator.share({ title: 'Booking confirmed', text, url: window.location.origin })
      return
    } catch {
      // user cancelled the native share sheet — fall through to clipboard
    }
  }
  if (import.meta.client && navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    toast.add({ description: 'Copied to clipboard', color: 'success' })
  }
}

useSeoMeta({ title: 'Booking confirmed', robots: 'noindex' })
</script>
