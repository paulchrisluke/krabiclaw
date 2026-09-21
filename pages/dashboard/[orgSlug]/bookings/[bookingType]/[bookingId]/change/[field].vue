<template>
  <!-- One field of the staged request. Done keeps the edit in the draft; nothing is sent from here. -->
  <DashboardLeafPanel v-if="field" id="booking-change-field" :title="`Change ${field}`" save-label="Done" @cancel="b.cancelChangeField(field)" @save="navigateTo(level.to.value ?? '/dashboard')">
    <div v-if="b.booking.value" class="mx-auto w-full max-w-md space-y-6">
      <UFormField v-if="field === 'date'" label="Date">
        <UInput v-model="b.changeDraft.value.bookingDate" type="date" size="xl" autofocus class="w-full" />
      </UFormField>
      <UFormField v-else-if="field === 'time'" label="Time">
        <UInput v-model="b.changeDraft.value.bookingTime" type="time" size="xl" autofocus class="w-full" />
      </UFormField>
      <UFormField v-else-if="field === 'guests'" label="Guests">
        <UInputNumber v-model="b.changeDraft.value.partySize" :min="1" :max="99" size="xl" class="w-full" />
      </UFormField>
      <UFormField v-else-if="field === 'location'" label="Location">
        <USelect v-model="b.changeDraft.value.locationId" :items="b.booking.value.locations.map(location => ({ label: location.title, value: location.id }))" size="xl" class="w-full" />
      </UFormField>
      <p class="text-sm text-muted">Nothing is sent yet. Your guest sees every change at once when you send the request.</p>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { bookingEditorKey, type BookingChangeField } from '~/components/dashboard/BookingDetails.vue'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const level = useRouteLevel()
const b = inject(bookingEditorKey)!
const value = String(route.params.field ?? '')
const field = (['date', 'time', 'guests', 'location'].includes(value) ? value : null) as BookingChangeField | null
// Raised, not thrown: the dashboard renders on the client, where a throw in a nested page's setup leaves a blank screen (DESIGN.md).
if (!field) showError(createError({ statusCode: 404, statusMessage: 'Editor not found' }))
else b.beginChangeField(field)
</script>
