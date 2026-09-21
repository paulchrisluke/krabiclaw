<template>
  <!--
    The record's summary in the thread's drawer. Changing it, a note, the guest
    — those are levels under the record's own URL, which the rows link into,
    so the editors exist once and the drawer stays a drawer.
  -->
  <BookingDetails
    v-if="bookingType && bookingId"
    :booking-type="bookingType"
    :booking-id="bookingId"
    :editor-path="`/dashboard/${String(route.params.orgSlug)}/bookings/${bookingType}/${encodeURIComponent(bookingId)}`"
  />
</template>

<script setup lang="ts">
import BookingDetails from '~/components/dashboard/BookingDetails.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const threadId = computed(() => String(route.params.threadId))

// The record is the thread's own opening submission, so it is read from the
// thread rather than passed through the URL a second time. A contact thread has
// no record and therefore no level here.
const { thread } = await useGuestThread(threadId)
if (thread.value && thread.value.submissionType === 'contact') {
  throw createError({ statusCode: 404, statusMessage: 'This conversation has no reservation' })
}
const bookingType = computed(() => thread.value?.submissionType === 'contact' ? null : thread.value?.submissionType ?? null)
const bookingId = computed(() => thread.value?.submissionId ?? null)

useSeoMeta({ title: 'Reservation details | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
