<template>
  <BookingDetails v-if="bookingType && bookingId" :booking-type="bookingType" :booking-id="bookingId" :editor-path="level.path.value" />
</template>

<script setup lang="ts">
import BookingDetails from '~/components/dashboard/BookingDetails.vue'

// A booking is reached from Today, which is where Back goes.
definePageMeta({ layout: 'dashboard', back: 'dashboard-orgSlug', key: route => `${route.params.orgSlug}:${route.params.bookingType}:${route.params.bookingId}` })
useSeoMeta({ title: 'Booking details | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const level = useRouteLevel()
const rawType = typeof route.params.bookingType === 'string' ? route.params.bookingType : undefined
const bookingType = rawType === 'reservation' || rawType === 'booking' ? rawType : null
const bookingId = String(route.params.bookingId || '')
// Raised, not thrown: the dashboard renders on the client, where a throw in a nested page's setup leaves a blank screen (DESIGN.md).
if (!bookingType || !bookingId) showError(createError({ statusCode: 404, statusMessage: 'Booking not found' }))
</script>
