<template>
  <div class="min-h-screen bg-default text-default">
    <BookingConfirmation
      v-if="confirmation"
      kicker="Request received"
      receipt-kicker="Your booking"
      :receipt-rows="receiptRows"
      next-steps-kicker="What happens next"
      :next-steps="nextSteps"
      cta-label="Browse more experiences"
      cta-to="/experiences"
    >
      <template #title>
        You're booked, {{ confirmation.guestName }}!
      </template>
      <template #subtitle>
        {{ confirmation.message }}
      </template>
      <template #actions>
        <SayaButton variant="soft" @click="share">
          <SayaIcon name="share" class="mr-1.5 size-4" />
          {{ justCopied ? 'Copied!' : 'Share' }}
        </SayaButton>
        <SayaButton v-if="confirmation.contactPhone" :href="`tel:${confirmation.contactPhone.replace(/\s/g, '')}`" variant="outline">
          Call us: {{ confirmation.contactPhone }}
        </SayaButton>
      </template>
    </BookingConfirmation>

    <div v-else class="mx-auto max-w-xl px-4 pt-24 pb-24 text-center sm:px-6 lg:px-8">
      <SayaIcon name="exclamation-triangle" class="mx-auto size-12 text-error" />
      <h2 class="mt-6 text-xl font-bold">No booking found</h2>
      <p class="mt-2 text-muted">We couldn't find a confirmation to show. Check your email for the details.</p>
      <SayaButton to="/experiences" variant="soft" class="mt-10">Browse experiences</SayaButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getBookingConfirmation, type BookingConfirmation as BookingConfirmationData } from '~/composables/useBookingHandoff'
import BookingConfirmation from '~/components/booking/BookingConfirmation.vue'
import { fmt12Hour } from '~/shared/reservation-hours'

definePageMeta({ layout: 'saya' })

const { formatDate } = useLocaleDate()
const justCopied = ref(false)
const { siteId } = useTenantSite()

const confirmation = ref<BookingConfirmationData | null>(null)

onMounted(() => {
  if (!siteId) return
  const handoff = getBookingConfirmation(siteId)
  confirmation.value = handoff && handoff.type === 'experience' ? handoff : null
})

const readableDate = computed(() => {
  if (!confirmation.value?.date) return ''
  return formatDate(`${confirmation.value.date}T12:00:00`)
})

const receiptRows = computed(() => {
  if (!confirmation.value) return []
  const rows: Array<{ label: string; value: string }> = []
  if (confirmation.value.title) rows.push({ label: 'Experience', value: confirmation.value.title })
  if (confirmation.value.locationName) rows.push({ label: 'Location', value: confirmation.value.locationName })
  rows.push({ label: 'Date', value: readableDate.value })
  rows.push({ label: 'Time', value: fmt12Hour(confirmation.value.time) })
  rows.push({ label: 'Guests', value: String(confirmation.value.guests) })
  if (confirmation.value.requests) rows.push({ label: 'Requests', value: confirmation.value.requests })
  return rows
})

const nextSteps = computed(() => [
  `We check the book and confirm your spot by email — usually within the hour, always same day.`,
  `No account needed. Your confirmation email has everything you need for the day.`,
  `Questions before then? Call the number below and we'll sort it out.`,
])

async function share() {
  if (!confirmation.value) return
  const text = `I'm booked for ${confirmation.value.title ?? confirmation.value.siteName} on ${readableDate.value} at ${fmt12Hour(confirmation.value.time)}.`
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
    justCopied.value = true
    setTimeout(() => { justCopied.value = false }, 2000)
  }
}

useSeoMeta({ title: 'Booking confirmed', robots: 'noindex' })
</script>
