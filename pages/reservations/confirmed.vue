<template>
  <div class="min-h-screen bg-default text-default">
    <template v-if="pending">
      <div class="flex min-h-screen items-center justify-center">
        <SayaIcon name="arrow-path" class="size-12 animate-spin text-muted" />
      </div>
    </template>

    <BookingConfirmation
      v-else-if="confirmation"
      kicker="Request received"
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
          fmt12Hour(confirmation.time)
        ) }}
        {{ resCopy.confirmSoonLabel(resCopy.reservationWord) }}
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
import { getBookingConfirmation, type BookingConfirmation as BookingConfirmationData } from '~/composables/useBookingHandoff'
import BookingConfirmation from '~/components/booking/BookingConfirmation.vue'
import { fmt12Hour } from '~/shared/reservation-hours'
import type { RenderedBookingPolicySummaryItem } from '~/server/utils/booking-policies'

definePageMeta({ layout: 'saya' })

const { site, siteId } = useTenantSite()
const { reservationPolicySiteDefault, reservationPolicyByLocation } = await useBootstrap()
const { locale } = useI18n()
const resCopy = computed(() => getVerticalCopy((site as ApiValue)?.vertical, locale.value))
const { formatDate } = useLocaleDate()
const route = useRoute()
const justCopied = ref(false)

const confirmation = ref<BookingConfirmationData | null>(null)
const pending = ref(true)

const readableDate = computed(() => {
  if (!confirmation.value?.date) return ''
  return formatDate(`${confirmation.value.date}T12:00:00`)
})

const receiptRows = computed(() => {
  if (!confirmation.value) return []
  const rows: Array<{ label: string; value: string }> = []
  if (confirmation.value.locationName) rows.push({ label: 'Location', value: confirmation.value.locationName })
  rows.push({ label: 'Date', value: readableDate.value })
  rows.push({ label: 'Time', value: fmt12Hour(confirmation.value.time) })
  rows.push({
    label: 'Party',
    value: `${confirmation.value.guests} ${Number(confirmation.value.guests) === 1 ? resCopy.value.guestLabel : resCopy.value.guestsLabelPlural}`,
  })
  rows.push({ label: 'Booked by', value: confirmation.value.guestName })
  if (confirmation.value.requests) rows.push({ label: 'Requests', value: confirmation.value.requests })
  return rows
})

const resolvedPolicySummary = computed(() => {
  if (confirmation.value?.sitePolicySummary) return confirmation.value.sitePolicySummary as ApiRecord
  const locationId = confirmation.value?.locationId
  if (locationId && reservationPolicyByLocation.value[locationId]) return reservationPolicyByLocation.value[locationId]
  return reservationPolicySiteDefault.value
})

const policyLines = computed(() => (resolvedPolicySummary.value?.items ?? []).map((item: RenderedBookingPolicySummaryItem) => String(item.text ?? '')))

const menuCtaTo = computed(() => {
  const slug = confirmation.value?.locationSlug
  if (slug) return `/locations/${slug}/menu`
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
      const res = await $fetch<{ reservation: { name: string; date: string; time: string; guests: string; location_id?: string | null } }>(
        `/api/public/sites/${siteId}/reservations/${resId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      confirmation.value = {
        type: 'reservation',
        siteId,
        siteName: String((site as ApiValue)?.brand_name ?? ''),
        guestName: res.reservation.name,
        date: res.reservation.date,
        time: res.reservation.time,
        guests: res.reservation.guests,
        locationId: typeof res.reservation.location_id === 'string' ? res.reservation.location_id : null,
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
  const text = `My reservation at ${confirmation.value.siteName} is confirmed for ${readableDate.value} at ${fmt12Hour(confirmation.value.time)}.`
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
