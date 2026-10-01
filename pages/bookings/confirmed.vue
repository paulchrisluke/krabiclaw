<template>
  <NuxtLayout :name="isBlawby ? 'blawby' : 'saya'">
  <div class="min-h-screen bg-default text-default">
    <BookingConfirmation
      v-if="confirmation"
      kicker="Request received"
      receipt-kicker="Your booking"
      :receipt-rows="receiptRows"
      :next-steps-kicker="resolvedPolicySummary?.heading ?? 'Booking policies'"
      :next-steps="policyLines"
      :next-steps-notes-html="resolvedPolicySummary?.additional_notes_html ?? ''"
      :cta-label="browseLabel"
      :cta-to="browseHref"
    >
      <template #title>
        {{ confirmation.status === 'pending' ? 'Request received' : "You’re booked" }}, {{ confirmation.guestName }}!
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
        <SayaButton v-if="confirmation.cancelUrl" :to="confirmation.cancelUrl" color="error" variant="ghost">
          Cancel booking
        </SayaButton>
      </template>
    </BookingConfirmation>

    <div v-else class="mx-auto max-w-xl px-4 pt-24 pb-24 text-center sm:px-6 lg:px-8">
      <SayaIcon name="exclamation-triangle" class="mx-auto size-12 text-error" />
      <h2 class="mt-6 text-xl font-bold">No booking found</h2>
      <p class="mt-2 text-muted">We couldn't find a confirmation to show. Check your email for the details.</p>
      <SayaButton :to="browseHref" variant="soft" class="mt-10">{{ browseLabel }}</SayaButton>
    </div>
  </div>
  </NuxtLayout>
</template>

<script setup lang="ts">
import { getBookingConfirmation, type BookingConfirmation as BookingConfirmationData } from '~/composables/useBookingHandoff'
import BookingConfirmation from '~/components/booking/BookingConfirmation.vue'
import { formatTimestamp } from '~/utils/timezone'
import { resolveProductPresentation } from '~/utils/product-presentation'
import type { RenderedBookingPolicySummaryItem } from '~/server/utils/reservations'

definePageMeta({ layout: false })
const { isBlawby } = usePublicTemplate()

const { locale } = useI18n()
const justCopied = ref(false)
const { organizationId } = useTenantOrganization()

const confirmation = ref<BookingConfirmationData | null>(null)
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

onMounted(() => {
  if (!organizationId) return
  const handoff = getBookingConfirmation(organizationId)
  confirmation.value = handoff && handoff.type === 'booking' ? handoff : null
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
  if (!confirmation.value) return
  const text = `${confirmation.value.status === 'pending' ? 'I requested' : "I'm booked for"} ${confirmation.value.title ?? confirmation.value.organizationName} on ${readableDate.value} at ${readableTime.value}.`
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
