<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'saya'">
  <div class="min-h-screen bg-default text-default">
    <div v-if="pending" class="flex min-h-screen items-center justify-center">
      <SayaIcon name="arrow-path" class="size-12 animate-spin text-muted" />
    </div>
    <BookingConfirmation
      v-else-if="confirmation"
      :kicker="confirmation.status === 'cancelled' ? 'Booking cancelled' : confirmation.status === 'pending' ? 'Request received' : 'Booking confirmed'"
      :cancelled="confirmation.status === 'cancelled'"
      receipt-kicker="Your booking"
      :receipt-rows="receiptRows"
      :next-steps-kicker="resolvedPolicySummary?.heading ?? 'Booking policies'"
      :next-steps="policyLines"
      :next-steps-notes-html="resolvedPolicySummary?.additional_notes_html ?? ''"
      :cta-label="browseLabel"
      :cta-to="browseHref"
      :guest-email="confirmation.guestEmail"
    >
      <template #title>
        {{ confirmation.status === 'cancelled' ? t('saya.experience_cancel.cancelled_title') : confirmation.status === 'pending' ? 'Request received' : "You’re booked" }}, {{ confirmation.guestName }}!
      </template>
      <template #subtitle>
        {{ confirmation.status === 'cancelled' ? t('saya.experience_cancel.cancelled_desc', { date: readableDate }) : confirmation.status === 'pending' ? 'Your request is waiting for confirmation from the business.' : 'Your booking is confirmed.' }}
      </template>
      <template #actions>
        <SayaButton v-if="confirmation.status !== 'cancelled'" variant="soft" @click="share">
          <SayaIcon name="share" class="mr-1.5 size-4" />
          {{ justCopied ? 'Copied!' : 'Share' }}
        </SayaButton>
        <SayaButton v-if="confirmation.contactPhone" :href="`tel:${confirmation.contactPhone.replace(/\s/g, '')}`" variant="outline">
          Call us: {{ confirmation.contactPhone }}
        </SayaButton>
        <SayaButton v-if="confirmation.cancelUrl" :to="confirmation.cancelUrl" color="error" variant="ghost">
          Cancel booking
        </SayaButton>
      </template>
    </BookingConfirmation>

    <div v-else class="mx-auto max-w-xl px-4 pt-24 pb-24 text-center sm:px-6 lg:px-8">
      <SayaIcon name="exclamation-triangle" class="mx-auto size-12 text-error" />
      <h2 class="mt-6 text-xl font-bold">{{ loadError ? 'Booking could not be loaded' : 'No booking found' }}</h2>
      <p class="mt-2 text-muted">{{ loadError ?? "We couldn't find a confirmation to show. Check your email for the details." }}</p>
      <SayaButton :to="browseHref" variant="soft" class="mt-10">{{ browseLabel }}</SayaButton>
    </div>
  </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import { loadBookingConfirmation, type BookingConfirmation as BookingConfirmationData } from '~/composables/useBookingHandoff'
import BookingConfirmation from '~/components/booking/BookingConfirmation.vue'
import { formatTimestamp } from '~/utils/timezone'
import { resolveProductPresentation } from '~/utils/product-presentation'
import type { RenderedBookingPolicySummaryItem } from '~/server/utils/reservations'

definePageMeta({ layout: false })
const { isBlawby } = usePublicTemplate()

const { locale, t } = useI18n()
const route = useRoute()
const justCopied = ref(false)
const { organizationId } = useTenantOrganization()

const confirmation = ref<BookingConfirmationData | null>(null)
const pending = ref(true)
const loadError = ref<string | null>(null)
const { organization } = useTenantOrganization()
const presentation = computed(() => resolveProductPresentation((organization as { vertical?: string | null } | null)?.vertical))
// Back to where the guest booked from: this location's own catalogue when the
// booking names one, otherwise the site's.
const browseHref = computed(() => {
  if (!presentation.value) return '/'
  if (isBlawby.value && !confirmation.value?.locationId) return '/schedule'
  const locationSlug = confirmation.value?.locationSlug
  return locationSlug
    ? `/locations/${locationSlug}/${presentation.value.locationCollectionSegment}`
    : presentation.value.collectionPath
})
const browseLabel = computed(() => isBlawby.value && !confirmation.value?.locationId ? 'View consultations' : presentation.value?.locationCollectionSegment === 'menu'
  ? 'Browse the menu'
  : 'Browse everything on offer')

onMounted(async () => {
  try {
    if (organizationId) confirmation.value = await loadBookingConfirmation(organizationId, 'booking', String((organization as ApiValue)?.name ?? ''), {
      id: typeof route.query.id === 'string' ? route.query.id : '', token: route.hash.slice(1),
    })
  } catch (cause) {
    loadError.value = getErrorMessage(cause, 'This booking could not be loaded.')
  } finally {
    pending.value = false
  }
})

// One instant plus one zone, formatted where the booking happens — the guest
// reads the venue's clock, not their browser's.
const readableDate = computed(() => confirmation.value
  ? formatTimestamp(confirmation.value.startsAt, locale.value, confirmation.value.timezone, { dateStyle: 'full' })
  : '')
const readableTime = computed(() => confirmation.value
  ? formatTimestamp(confirmation.value.startsAt, locale.value, confirmation.value.timezone, { timeStyle: 'short' })
  : '')

const receiptRows = computed(() => {
  if (!confirmation.value) return []
  const rows: Array<{ label: string; value: string }> = []
  if (confirmation.value.title) rows.push({ label: confirmation.value.status === 'pending' ? 'Requested service' : 'Booked', value: confirmation.value.title })
  if (!confirmation.value.locationId) rows.push({ label: 'Format', value: 'Online' })
  else if (confirmation.value.locationName) rows.push({ label: 'Location', value: confirmation.value.locationName })
  rows.push({ label: 'Date', value: readableDate.value })
  rows.push({ label: 'Time', value: readableTime.value })
  if (!confirmation.value.locationId) rows.push({ label: 'Timezone', value: confirmation.value.timezone })
  if ((organization as { vertical?: string | null } | null)?.vertical !== 'service') {
    rows.push({ label: 'Guests', value: String(confirmation.value.guests) })
  }
  if (confirmation.value.requests) rows.push({ label: 'Requests', value: confirmation.value.requests })
  return rows
})

/**
 * The policy the guest agreed to, from the booking that carries it.
 *
 * One source. This used to try the snapshot, then a per-experience policy,
 * then a site default — so a guest could be shown terms that were never the
 * ones their booking was made under. If the snapshot is absent, no terms are
 * shown rather than someone else's.
 */
const resolvedPolicySummary = computed(() =>
  (confirmation.value?.policySummary as ApiRecord | undefined) ?? null)

const policyLines = computed(() => (resolvedPolicySummary.value?.items ?? []).map((item: RenderedBookingPolicySummaryItem) => String(item.text ?? '')))

async function share() {
  if (!confirmation.value || confirmation.value.status === 'cancelled') return
  const text = `${confirmation.value.status === 'pending' ? 'I requested' : "I'm booked for"} ${confirmation.value.title ?? confirmation.value.organizationName} on ${readableDate.value} at ${readableTime.value}.`
  if (import.meta.client && navigator.share) {
    try {
      await navigator.share({ title: confirmation.value.status === 'pending' ? 'Booking requested' : 'Booking confirmed', text, url: window.location.origin })
      return
    } catch (error) {
      // Cancelling the native share sheet falls through to the clipboard.
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error
    }
  }
  if (import.meta.client && navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    justCopied.value = true
    setTimeout(() => { justCopied.value = false }, 2000)
  }
}

useSocialMetadata(() => ({
  path: '/bookings/confirmed',
  title: confirmation.value?.status === 'cancelled' ? 'Booking cancelled' : 'Booking receipt',
  description: confirmation.value?.status === 'cancelled' ? 'Your booking has been cancelled.' : 'View your booking details.',
  socialImage: null,
  discoverability: 'private',
}))
</script>
