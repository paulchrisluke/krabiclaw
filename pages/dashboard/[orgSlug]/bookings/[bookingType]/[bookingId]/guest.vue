<template>
  <!-- Read-only guest details are a description list, not a form: nothing to save. -->
  <DashboardLeafPanel id="booking-guest" title="Guest details" :footer="false">
    <div v-if="b.booking.value" class="mx-auto w-full max-w-md space-y-6">
      <h3 class="text-[32px] font-semibold leading-tight text-highlighted">{{ b.booking.value.guestName }}</h3>
      <dl class="space-y-4">
        <div>
          <dt class="text-sm text-muted">Email</dt>
          <dd class="mt-1 break-words text-highlighted">{{ b.booking.value.guestEmail }}</dd>
        </div>
        <div v-if="b.booking.value.guestPhone">
          <dt class="text-sm text-muted">Phone</dt>
          <dd class="mt-1 text-highlighted">{{ b.booking.value.guestPhone }}</dd>
        </div>
      </dl>
      <div class="flex gap-3">
        <UButton :to="b.messageTo.value || undefined" label="Message" icon="i-lucide-message-circle" color="neutral" variant="soft" :disabled="!b.messageTo.value" />
        <UButton :to="b.callTo.value || undefined" label="Call" icon="i-lucide-phone" color="neutral" variant="soft" :disabled="!b.callTo.value" />
      </div>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { bookingEditorKey } from '~/components/dashboard/BookingDetails.vue'

definePageMeta({ layout: 'dashboard' })

const b = inject(bookingEditorKey)!
</script>
