<template>
  <UDashboardPanel id="booking-details">
    <template #header>
      <UDashboardNavbar :title="isChangeMode && noun ? `Change ${noun}` : pageTitle" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading
            :to="isChangeMode ? bookingPath : todayPath"
            :label="isChangeMode && noun ? capitalize(noun) : 'Today'"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <BookingDetails :booking-type="bookingType" :booking-id="bookingId" :base-path="bookingPath" />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import BookingDetails from '~/components/dashboard/BookingDetails.vue'

definePageMeta({ layout: 'dashboard', key: route => `${route.params.orgSlug}:${route.params.bookingType}:${route.params.bookingId}` })
useSeoMeta({ title: 'Booking details | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const rawType = typeof route.params.bookingType === 'string' ? route.params.bookingType : undefined
if (rawType !== 'reservation' && rawType !== 'booking') {
  throw createError({ statusCode: 404, statusMessage: 'Booking not found' })
}
const bookingType = rawType
const bookingId = String(route.params.bookingId || '')
if (!bookingId) throw createError({ statusCode: 404, statusMessage: 'Booking not found' })

const orgSlug = computed(() => String(route.params.orgSlug || ''))
const todayPath = computed(() => `/dashboard/${orgSlug.value}`)
const bookingPath = computed(() => `${todayPath.value}/bookings/${bookingType}/${encodeURIComponent(bookingId)}`)

// The navbar names the record, so it reads the same load the body reads — one
// `useAsyncData` key, one request.
const { noun, pageTitle } = await useBookingDetails(bookingType, bookingId)

// Change is a mode of the record and the navbar says so, so the segment is read
// here rather than reported upward out of the body.
const isChangeMode = computed(() => route.path.startsWith(`${bookingPath.value}/change`))

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
}
</script>
