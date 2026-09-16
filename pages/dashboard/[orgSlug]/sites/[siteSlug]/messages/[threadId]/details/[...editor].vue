<template>
  <BookingDetails
    v-if="bookingType && bookingId"
    :booking-type="bookingType"
    :booking-id="bookingId"
    :base-path="detailsPath"
  />
</template>

<script setup lang="ts">
import BookingDetails from '~/components/dashboard/BookingDetails.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const threadId = computed(() => String(route.params.threadId))
const detailsPath = computed(() => `/dashboard/${String(route.params.orgSlug)}/sites/${String(route.params.siteSlug)}/messages/${encodeURIComponent(threadId.value)}/details`)

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
