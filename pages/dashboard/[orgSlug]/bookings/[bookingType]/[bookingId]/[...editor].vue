<template>
  <BookingDetailsPage :booking-type="bookingType" :booking-id="bookingId" />
</template>

<script setup lang="ts">
import BookingDetailsPage from '~/components/dashboard/BookingDetailsPage.vue'

definePageMeta({ layout: 'dashboard', key: route => `${route.params.orgSlug}:${route.params.bookingType}:${route.params.bookingId}` })
useSeoMeta({ title: 'Booking details | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const rawType = typeof route.params.bookingType === 'string' ? route.params.bookingType : undefined
if (rawType !== 'reservation' && rawType !== 'experience_booking') {
  throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
}
const bookingType = rawType
const bookingId = String(route.params.bookingId || '')
if (!bookingId) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
</script>
