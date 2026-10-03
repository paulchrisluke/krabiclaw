<template>
  <DashboardLeafPanel :id="`booking-${concern}`" :title="setting.title" :lead="setting.lead" :ready="p.ready.value" :saving="p.saving.value" :disabled="!valid || !dirty" :error="p.saveError.value ?? ''" @cancel="p.revert" @save="save">
    <SettingRow v-if="concern === 'enabled'" v-model="p.form.bookable" label="Use a booking calendar" />
    <UFormField v-else-if="concern === 'duration'" label="Duration in minutes" required>
      <UInput v-model="p.form.booking_duration" inputmode="numeric" pattern="[0-9]*" class="w-full" />
    </UFormField>
    <div v-else-if="concern === 'capacity'" class="space-y-6">
      <URadioGroup v-model="capacityChoice" :items="capacityOptions" variant="card" />
      <UFormField v-if="capacityChoice === 'group'" label="Maximum guests per session" required>
        <UInput v-model="p.form.booking_capacity" inputmode="numeric" pattern="[0-9]*" class="w-full" />
      </UFormField>
    </div>
    <URadioGroup v-else-if="concern === 'confirmation'" v-model="p.form.confirmation_mode" :items="[{ value: 'instant', label: 'Confirm automatically' }, { value: 'review', label: 'Review each request' }]" variant="card" />
    <SettingRow v-else-if="concern === 'payment'" v-model="p.form.online_payment_required" label="Require online payment for paid sessions" />
    <LocationTimezoneField v-else-if="concern === 'location'" v-model="onlineTimezone" />
    <UFormField v-else-if="concern === 'calendar'" label="Calendar name" hint="Optional">
      <p class="mb-3 text-sm text-muted">{{ p.form.calendar_group.length }}/64</p>
      <UInput v-model="p.form.calendar_group" :maxlength="64" variant="none" :ui="{ base: 'px-0 text-2xl md:text-2xl' }" class="w-full" />
    </UFormField>
    <SettingRow v-else-if="concern === 'website'" v-model="p.form.native_consultations" label="Let guests book on this website" />
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import SettingRow from '~/components/dashboard/SettingRow.vue'
import { productEditorKey, type BookingConcern } from '~/components/dashboard/ProductEditorPage.vue'
import LocationTimezoneField from '~/lib/components/workspace/location/LocationTimezoneField.vue'
import { isValidTimezone } from '~/utils/timezone'

definePageMeta({ layout: 'dashboard' })
const p = inject(productEditorKey)!
const route = useRoute()
const level = useRouteLevel()
const concern = computed(() => String(route.params.concern))
const settings = {
  enabled: { title: 'Booking calendar', lead: 'Set up times for guests to book. Removing the calendar deletes its schedule and is only allowed before any bookings. To pause this offering and keep its schedule, use its Website settings.' },
  duration: { title: 'Duration', lead: 'How long does each session last? Existing appointments keep their saved duration.' },
  capacity: { title: 'Guest limit', lead: 'How many guests can book the same session? Existing appointments keep their saved guest limit.' },
  confirmation: { title: 'Confirmation', lead: 'Confirm bookings as soon as guests reserve, or review each request before confirming.' },
  payment: { title: 'Payment', lead: 'Online checkout is not available yet. Requiring payment prevents guests from booking paid sessions; free sessions remain bookable.' },
  location: { title: 'Meeting location', lead: 'Choose a city for your online schedule; times follow its time zone and daylight saving is handled automatically.' },
  calendar: { title: 'Shared availability', lead: 'Use the same calendar name for online services that cannot run at the same time. Leave it empty for an independent schedule.' },
  website: { title: 'Website booking', lead: 'This applies to all services on your website. Guests can choose times for published online services with a weekly schedule.' },
}
const setting = computed(() => settings[concern.value as keyof typeof settings] ?? { title: '', lead: '' })
watchEffect(() => {
  if (level.mode.value === 'yield') return
  if ((['location', 'calendar'].includes(concern.value) && p.locationId.value) || (concern.value === 'calendar' && p.ready.value && !p.product.value?.booking?.online_timezone) || !(concern.value in settings) || (concern.value !== 'enabled' && !p.product.value?.booking && p.ready.value) || (concern.value === 'website' && !p.websiteBooking.value)) showError(createError({ statusCode: 404, statusMessage: 'Page not found' }))
})
const capacityOptions = [{ value: 'one', label: 'One guest' }, { value: 'group', label: 'A group of guests' }, { value: 'unlimited', label: 'No guest limit' }, { value: 'closed', label: 'Closed to new guests' }]
const capacityChoice = ref('unlimited')
function reset() {
  p.revert()
  capacityChoice.value = p.form.booking_capacity === '' ? 'unlimited' : p.form.booking_capacity === '1' ? 'one' : p.form.booking_capacity === '0' ? 'closed' : 'group'
}
watch([concern, p.product], reset, { immediate: true })
watch(capacityChoice, choice => {
  if (choice === 'one') p.form.booking_capacity = '1'
  else if (choice === 'unlimited') p.form.booking_capacity = ''
  else if (choice === 'closed') p.form.booking_capacity = '0'
  else if (Number(p.form.booking_capacity) < 2) p.form.booking_capacity = ''
})
const onlineTimezone = computed({ get: () => p.form.online_timezone, set: value => { p.form.online_timezone = value; p.form.online_schedule = Boolean(value) } })
const valid = computed(() => {
  if (concern.value === 'duration') return Number.isSafeInteger(Number(p.form.booking_duration)) && Number(p.form.booking_duration) > 0
  if (concern.value === 'capacity') return capacityChoice.value !== 'group' || (Number.isSafeInteger(Number(p.form.booking_capacity)) && Number(p.form.booking_capacity) >= 2)
  if (concern.value === 'location') return isValidTimezone(p.form.online_timezone)
  return true
})
const dirty = computed(() => {
  const config = p.product.value?.booking
  switch (concern.value) {
    case 'enabled': return p.form.bookable !== Boolean(config)
    case 'duration': return Number(p.form.booking_duration) !== config?.duration_minutes
    case 'capacity': return (p.form.booking_capacity === '' ? null : Number(p.form.booking_capacity)) !== config?.default_capacity
    case 'confirmation': return p.form.confirmation_mode !== config?.confirmation_mode
    case 'payment': return p.form.online_payment_required !== config?.online_payment_required
    case 'location': return (p.form.online_schedule ? p.form.online_timezone : null) !== config?.online_timezone
    case 'calendar': return (p.form.calendar_group.trim() || null) !== config?.calendar_group
    case 'website': return p.form.native_consultations !== (p.form.consultation_mode === 'native')
    default: return false
  }
})
function save() { return p.save(level.to.value ?? undefined, concern.value as BookingConcern) }
onBeforeRouteLeave(() => { p.revert() })
</script>
