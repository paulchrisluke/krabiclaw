<template>
  <div class="min-h-screen bg-default text-default">
    <div class="mx-auto max-w-xl px-4 pt-16 pb-24 sm:px-6 lg:px-8">
      <template v-if="pending">
        <SayaIcon name="arrow-path" class="mx-auto size-12 animate-spin text-muted" />
      </template>

      <template v-else-if="confirmation">
        <div class="rounded-3xl border border-default bg-elevated p-10 text-center shadow-sm sm:p-12">
          <div class="mb-8 flex justify-center">
            <div class="flex size-20 items-center justify-center rounded-full bg-primary/10">
              <SayaIcon name="check-circle" class="size-12 text-primary" />
            </div>
          </div>

          <h1 class="saya-display saya-italic text-4xl text-default">
            {{ resCopy.thankYouLabel(confirmation.guestName) }}
          </h1>
          <p class="mt-4 text-muted">
            {{ resCopy.confirmationMessage(
              confirmation.guests,
              Number(confirmation.guests) === 1 ? resCopy.guestLabel : resCopy.guestsLabelPlural,
              readableDate,
              confirmation.time
            ) }}
          </p>
          <p class="mt-2 text-sm text-muted">
            {{ resCopy.confirmSoonLabel(resCopy.reservationWord) }}
          </p>

          <div v-if="confirmation.requests" class="mt-8 rounded-2xl border border-default bg-default px-6 py-5 text-left">
            <p class="saya-eyebrow mb-1 text-muted">Special requests</p>
            <p class="text-sm text-default">{{ confirmation.requests }}</p>
          </div>

          <div v-if="confirmation.cancelUrl" class="mt-8 rounded-2xl border border-default bg-default px-6 py-5">
            <p class="saya-eyebrow mb-1 text-muted">{{ resCopy.manageLabel(resCopy.reservationWord) }}</p>
            <p class="text-sm text-muted">{{ resCopy.cancelAnytimeLabel }}</p>
            <SayaButton :to="confirmation.cancelUrl" color="error" variant="ghost" size="md" class="mt-4">
              <SayaIcon name="x-circle" class="mr-1.5 size-4" />
              {{ resCopy.cancelLabel(resCopy.reservationWord) }}
            </SayaButton>
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
              {{ resCopy.callUsLabel(confirmation.contactPhone) }}
            </SayaButton>
            <SayaButton to="/reservations" variant="ghost" size="md">
              {{ resCopy.makeAnotherLabel(resCopy.reservationWord) }}
            </SayaButton>
          </div>
        </div>
      </template>

      <div v-else class="rounded-3xl border border-default bg-muted/20 p-12 text-center">
        <SayaIcon name="exclamation-triangle" class="mx-auto size-12 text-error" />
        <h2 class="mt-6 text-xl font-bold">No reservation found</h2>
        <p class="mt-2 text-muted">We couldn't find a confirmation to show. Check your email for the details.</p>
        <SayaButton to="/reservations" variant="soft" class="mt-10">Make a reservation</SayaButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getBookingConfirmation, type BookingConfirmation } from '~/composables/useBookingHandoff'

definePageMeta({ layout: 'saya' })

const { site, siteId } = useTenantSite()
const { locale } = useI18n()
const resCopy = computed(() => getVerticalCopy((site as ApiValue)?.vertical, locale.value))
const { formatDate } = useLocaleDate()
const route = useRoute()
const justCopied = ref(false)

const confirmation = ref<BookingConfirmation | null>(null)
const pending = ref(true)

const readableDate = computed(() => {
  if (!confirmation.value?.date) return ''
  return formatDate(`${confirmation.value.date}T12:00:00`)
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
      const res = await $fetch<{ reservation: { name: string; date: string; time: string; guests: string } }>(
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
  const text = `My reservation at ${confirmation.value.siteName} is confirmed for ${readableDate.value} at ${confirmation.value.time}.`
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
