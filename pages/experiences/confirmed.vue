<template>
  <div class="min-h-screen bg-default text-default">
    <div class="mx-auto max-w-xl px-4 pt-16 pb-24 sm:px-6 lg:px-8">
      <template v-if="confirmation">
        <div class="rounded-3xl border border-default bg-elevated p-10 text-center shadow-sm sm:p-12">
          <div class="mb-8 flex justify-center">
            <div class="flex size-20 items-center justify-center rounded-full bg-primary/10">
              <SayaIcon name="check-circle" class="size-12 text-primary" />
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
            <SayaButton variant="soft" @click="share">
              <SayaIcon name="share" class="mr-1.5 size-4" />
              {{ justCopied ? 'Copied!' : 'Share' }}
            </SayaButton>
            <SayaButton
              v-if="confirmation.contactPhone"
              :href="`tel:${confirmation.contactPhone.replace(/\s/g, '')}`"
              variant="soft"
            >
              Call us: {{ confirmation.contactPhone }}
            </SayaButton>
            <SayaButton to="/experiences" variant="ghost" size="md">Browse more experiences</SayaButton>
          </div>
        </div>
      </template>

      <div v-else class="rounded-3xl border border-default bg-muted/20 p-12 text-center">
        <SayaIcon name="exclamation-triangle" class="mx-auto size-12 text-error" />
        <h2 class="mt-6 text-xl font-bold">No booking found</h2>
        <p class="mt-2 text-muted">We couldn't find a confirmation to show. Check your email for the details.</p>
        <SayaButton to="/experiences" variant="soft" class="mt-10">Browse experiences</SayaButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getBookingConfirmation, type BookingConfirmation } from '~/composables/useBookingHandoff'

definePageMeta({ layout: 'saya' })

const { formatDate } = useLocaleDate()
const justCopied = ref(false)
const { siteId } = useTenantSite()

const confirmation = ref<BookingConfirmation | null>(null)

onMounted(() => {
  if (!siteId) return
  const handoff = getBookingConfirmation(siteId)
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
    justCopied.value = true
    setTimeout(() => { justCopied.value = false }, 2000)
  }
}

useSeoMeta({ title: 'Booking confirmed', robots: 'noindex' })
</script>
