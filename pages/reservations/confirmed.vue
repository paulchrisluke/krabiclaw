<template>
  <div class="min-h-screen bg-default text-default">
    <div class="mx-auto max-w-xl px-4 pt-16 pb-24 sm:px-6 lg:px-8">
      <template v-if="pending">
        <UIcon name="i-heroicons-arrow-path" class="mx-auto size-12 animate-spin text-muted" />
      </template>

      <template v-else-if="confirmation">
        <div class="rounded-3xl border border-default bg-elevated p-10 text-center shadow-sm sm:p-12">
          <div class="mb-8 flex justify-center">
            <div class="flex size-20 items-center justify-center rounded-full bg-primary/10">
              <UIcon name="i-heroicons-check-circle" class="size-12 text-primary" />
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
            <UButton :to="confirmation.cancelUrl" color="error" variant="ghost" size="sm" class="mt-4 rounded-full">
              <UIcon name="i-heroicons-x-circle" class="mr-1.5 size-4" />
              {{ resCopy.cancelLabel(resCopy.reservationWord) }}
            </UButton>
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
              {{ resCopy.callUsLabel(confirmation.contactPhone) }}
            </UButton>
            <UButton to="/reservations" color="primary" variant="ghost" size="sm">
              {{ resCopy.makeAnotherLabel(resCopy.reservationWord) }}
            </UButton>
          </div>
        </div>
      </template>

      <div v-else class="rounded-3xl border border-default bg-muted/20 p-12 text-center">
        <UIcon name="i-heroicons-exclamation-triangle" class="mx-auto size-12 text-error" />
        <h2 class="mt-6 text-xl font-bold">No reservation found</h2>
        <p class="mt-2 text-muted">We couldn't find a confirmation to show. Check your email for the details.</p>
        <UButton to="/reservations" color="primary" variant="soft" class="mt-10 rounded-full">Make a reservation</UButton>
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
const toast = useToast()

const confirmation = ref<BookingConfirmation | null>(null)
const pending = ref(true)

const readableDate = computed(() => {
  if (!confirmation.value?.date) return ''
  return formatDate(`${confirmation.value.date}T12:00:00`)
})

onMounted(async () => {
  const handoff = getBookingConfirmation()
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
    toast.add({ description: 'Copied to clipboard', color: 'success' })
  }
}

useSeoMeta({ title: 'Reservation confirmed', robots: 'noindex' })
</script>
