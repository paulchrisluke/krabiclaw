<template>
  <DashboardIndexPanel id="booking-details" :title="pageTitle" :ui="{ body: 'p-0 sm:p-0' }">
    <BookingDetails :booking-type="bookingType" :booking-id="bookingId" :editor-path="level.path.value" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import BookingDetails from '~/components/dashboard/BookingDetails.vue'

// A booking is reached from Today, which is where Back goes.
definePageMeta({ layout: 'dashboard', back: 'dashboard-orgSlug', key: route => `${route.params.orgSlug}:${route.params.bookingType}:${route.params.bookingId}` })
useSeoMeta({ title: 'Booking details | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const level = useRouteLevel()
const rawType = typeof route.params.bookingType === 'string' ? route.params.bookingType : undefined
if (rawType !== 'reservation' && rawType !== 'booking') {
  throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
}
const bookingType = rawType
const bookingId = String(route.params.bookingId || '')
if (!bookingId) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })

// The navbar names the record, so it reads the same load the body reads — one
// `useAsyncData` key, one request.
const { pageTitle } = await useBookingDetails(bookingType, bookingId)
</script>
