<template>
  <div class="min-h-screen bg-default text-default">
    <template v-if="pending">
      <div class="flex min-h-screen items-center justify-center">
        <SayaIcon name="arrow-path" class="size-12 animate-spin text-muted" />
      </div>
    </template>

    <BookingConfirmation
      v-else-if="confirmation"
      kicker="Reservation confirmed"
      :receipt-kicker="resCopy.reservationWord"
      :receipt-rows="receiptRows"
      :next-steps-kicker="resolvedPolicySummary?.heading ?? resCopy.reservationPoliciesHeading"
      :next-steps="policyLines"
      :next-steps-notes-html="resolvedPolicySummary?.additional_notes_html ?? ''"
      :cta-label="resCopy.reservationExploreLabel"
      :cta-to="menuCtaTo"
    >
      <template #title>
        {{ resCopy.thankYouLabel(confirmation.guestName) }}
      </template>
      <template #subtitle>
        {{ resCopy.confirmationMessage(
          confirmation.guests,
          Number(confirmation.guests) === 1 ? resCopy.guestLabel : resCopy.guestsLabelPlural,
          readableDate,
          readableTime
        ) }}
      </template>
      <template #actions>
        <SayaButton variant="soft" @click="share">
          <SayaIcon name="share" class="mr-1.5 size-4" />
          {{ justCopied ? 'Copied!' : 'Share' }}
        </SayaButton>
        <SayaButton v-if="confirmation.contactPhone" :href="`tel:${confirmation.contactPhone.replace(/\s/g, '')}`" variant="outline">
          {{ resCopy.callUsLabel(confirmation.contactPhone) }}
        </SayaButton>
        <SayaButton v-if="confirmation.cancelUrl" :to="confirmation.cancelUrl" color="error" variant="ghost">
          {{ resCopy.cancelLabel(resCopy.reservationWord) }}
        </SayaButton>
      </template>
    </BookingConfirmation>

    <div v-else class="mx-auto max-w-xl px-4 pt-24 pb-24 text-center sm:px-6 lg:px-8">
      <SayaIcon name="exclamation-triangle" class="mx-auto size-12 text-error" />
      <h2 class="mt-6 text-xl font-bold">No reservation found</h2>
      <p class="mt-2 text-muted">We couldn't find a confirmation to show. Check your email for the details.</p>
      <SayaButton to="/reservations" variant="soft" class="mt-10">Select a time</SayaButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { $fetch } from 'ofetch'
import { getBookingConfirmation, type BookingConfirmation as BookingConfirmationData } from '~/composables/useBookingHandoff'
import BookingConfirmation from '~/components/booking/BookingConfirmation.vue'
import { formatTimestamp } from '~/utils/timezone'
import { resolveProductPresentation } from '~/utils/product-presentation'
import type { RenderedBookingPolicySummaryItem } from '~/server/utils/reservations'

definePageMeta({ layout: 'saya' })

const { site, siteId } = useTenantSite()
const { reservationPolicyByLocation } = await usePublicPageData()
const { locale } = useI18n()
const resCopy = computed(() => getVerticalCopy((site as ApiValue)?.vertical, locale.value))
const route = useRoute()
const justCopied = ref(false)

const confirmation = ref<BookingConfirmationData | null>(null)
const pending = ref(true)

// One instant plus one zone, read in the location's own zone — the guest sees
// the hour the table is held, wherever they open the page.
const readableDate = computed(() => confirmation.value
  ? formatTimestamp(confirmation.value.startsAt, locale.value, confirmation.value.timezone, { dateStyle: 'full' })
  : '')
const readableTime = computed(() => confirmation.value
  ? formatTimestamp(confirmation.value.startsAt, locale.value, confirmation.value.timezone, { timeStyle: 'short' })
  : '')

const receiptRows = computed(() => {
  if (!confirmation.value) return []
  const rows: Array<{ label: string; value: string }> = []
  if (confirmation.value.locationName) rows.push({ label: 'Location', value: confirmation.value.locationName })
  rows.push({ label: 'Date', value: readableDate.value })
  rows.push({ label: 'Time', value: readableTime.value })
  rows.push({
    label: 'Party',
    value: `${confirmation.value.guests} ${Number(confirmation.value.guests) === 1 ? resCopy.value.guestLabel : resCopy.value.guestsLabelPlural}`,
  })
  rows.push({ label: 'Booked by', value: confirmation.value.guestName })
  if (confirmation.value.requests) rows.push({ label: 'Requests', value: confirmation.value.requests })
  return rows
})

const resolvedPolicySummary = computed(() => {
  if (confirmation.value?.policySummary) return confirmation.value.policySummary as ApiRecord
  const locationId = confirmation.value?.locationId
  if (!locationId) return null
  if (!Object.prototype.hasOwnProperty.call(reservationPolicyByLocation.value, locationId)) {
    throw createError({ statusCode: 500, statusMessage: 'Reservation policy contract is missing the booked location' })
  }
  return reservationPolicyByLocation.value[locationId]
})

const policyLines = computed(() => (resolvedPolicySummary.value?.items ?? []).map((item: RenderedBookingPolicySummaryItem) => String(item.text ?? '')))

// Back to the catalogue the guest reserved against: this location's own when
// the reservation names one, otherwise the site's.
const presentation = computed(() => resolveProductPresentation((site as { vertical?: string | null } | null)?.vertical))
const menuCtaTo = computed(() => {
  const slug = confirmation.value?.locationSlug
  if (slug && presentation.value) return `/locations/${slug}/${presentation.value.locationCollectionSegment}`
  return resCopy.value.reservationExploreRoute
})

onMounted(async () => {
  if (!siteId) {
    pending.value = false
    return
  }

  const handoff = getBookingConfirmation(siteId)
  if (handoff && handoff.type === 'reservation') {
    confirmation.value = handoff
    pending.value = false
    return
  }

  // Refresh / shared-link fallback: recover the essentials from the same
  // authenticated lookup the cancel page uses (id + token, no special requests).
  const resId = route.query.id as string | undefined
  const token = route.hash ? route.hash.substring(1) : ''
  if (resId && token) {
    try {
      const res = await $fetch<{ booking: { name: string; starts_at: string; timezone: string; guests: string; location_id?: string | null } }>(
        `/api/public/sites/${siteId}/booking-requests/${resId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      confirmation.value = {
        type: 'reservation',
        siteId,
        siteName: String((site as ApiValue)?.brand_name ?? ''),
        guestName: res.booking.name,
        startsAt: res.booking.starts_at,
        timezone: res.booking.timezone,
        guests: res.booking.guests,
        locationId: typeof res.booking.location_id === 'string' ? res.booking.location_id : null,
        cancelUrl: `/reservations/cancel?id=${resId}#${token}`,
      }
    } catch {
      confirmation.value = null
    }
  }
  pending.value = false
})

async function share() {
  if (!confirmation.value) return
  const text = `My reservation at ${confirmation.value.siteName} is confirmed for ${readableDate.value} at ${readableTime.value}.`
  if (import.meta.client && navigator.share) {
    try {
      await navigator.share({ title: 'Reservation confirmed', text, url: window.location.origin })
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

useSeoMeta({ title: 'Reservation confirmed', robots: 'noindex' })
</script>
