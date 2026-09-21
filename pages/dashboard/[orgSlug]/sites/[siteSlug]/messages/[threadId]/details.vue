<template>
  <!--
    The record's summary, a level under the conversation. Changing it, a note,
    the guest — those are levels under the record's own URL, which the rows link
    into, so the editors exist once here and once there.
  -->
  <DashboardLeafPanel v-if="bookingType && bookingId" id="thread-record" :title="recordTitle" :footer="false">
    <BookingDetails
      :booking-type="bookingType"
      :booking-id="bookingId"
      :editor-path="`/dashboard/${String(route.params.orgSlug)}/bookings/${bookingType}/${encodeURIComponent(bookingId)}`"
      embedded
    />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import BookingDetails from '~/components/dashboard/BookingDetails.vue'
import { threadRecordTitle } from '~/lib/components/workspace/messages/guest-thread-client'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const threadId = computed(() => String(route.params.threadId))

// The record is the thread's own opening submission, so it is read from the
// thread rather than passed through the URL a second time. A contact thread has
// no record and therefore no level here.
const { thread } = await useGuestThread(threadId)
if (thread.value && thread.value.submissionType === 'contact') {
  showError(createError({ statusCode: 404, statusMessage: 'This conversation has no reservation' }))
}
const bookingType = computed(() => thread.value?.submissionType === 'contact' ? null : thread.value?.submissionType ?? null)
const bookingId = computed(() => thread.value?.submissionId ?? null)
const dashboard = useDashboardSite()
// The tenant's own word for the record, the same one the thread's control uses.
const recordTitle = computed(() => (thread.value
  ? threadRecordTitle(thread.value.submissionType, dashboard.site.value?.vertical ?? null)
  : 'Details'))

useSeoMeta({ title: 'Reservation details | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
