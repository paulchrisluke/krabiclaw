<template>
  <DashboardIndexPanel id="product-booking" title="Bookings" :auto-open="groups[0]?.items[0]?.to ?? null">
    <USkeleton v-if="!p.ready.value" class="h-32" />
    <EditorNavigationList v-else :groups="groups" :active-item="level.child.value" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup, type EditorNavigationItem } from '~/components/dashboard/EditorNavigationList.vue'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'
import { timezoneLabel } from '~/utils/timezone'

definePageMeta({ layout: 'dashboard' })
const p = inject(productEditorKey)!
const level = useRouteLevel()
const { currentLocation } = useDashboardLocation()
const route = useRoute()
const router = useRouter()
const to = (name: string) => router.resolve({ path: `${level.path.value}/${name}`, query: route.query }).fullPath
const row = (id: string, label: string, summary: string) => ({ id, label, summary, to: to(id) })
const groups = computed<EditorNavigationGroup[]>(() => {
  const config = p.product.value?.booking
  const items: EditorNavigationItem[] = config ? [] : [row('enabled', 'Accept bookings', 'Off')]
  if (config) items.push(
    row('duration', 'Duration', config.duration_minutes ? `${config.duration_minutes} minutes` : 'Choose a duration'),
    p.locationId.value ? { id: 'location', label: 'Meeting location', summary: currentLocation.value!.title } : row('location', 'Meeting location', config.online_timezone ? `Online · ${timezoneLabel(config.online_timezone)}` : 'Choose a time zone'),
    row('capacity', 'Guest limit', config.default_capacity === null ? 'No guest limit' : config.default_capacity === 1 ? 'One guest per session' : config.default_capacity === 0 ? 'Closed to new guests' : `Up to ${config.default_capacity} guests per session`),
    row('confirmation', 'Confirmation', config.confirmation_mode === 'instant' ? 'Confirm automatically' : 'Review each request'),
    row('schedule', 'Weekly schedule', p.scheduleLoading.value ? 'Loading times…' : p.scheduleError.value ? 'Could not load times' : p.weekdays.filter(day => p.savedSlotsFor(day.value).length).map(day => day.label).join(', ') || 'No weekly times set'),
  )
  return [
    { id: 'setup', items },
    ...(config ? [{ id: 'options', label: 'More options', items: [
      row('enabled', 'Accept bookings', 'On'),
      row('payment', 'Payment', config.online_payment_required ? 'Online payment required for paid sessions' : 'No payment collected at booking'),
      ...(!p.locationId.value && config.online_timezone ? [row('calendar', 'Shared availability', config.calendar_group || 'Independent schedule')] : []),
      ...(p.websiteBooking.value ? [row('website', 'Website booking', p.form.consultation_mode === 'native' ? 'Guests book on your website' : p.form.consultation_mode === 'external_url' ? 'External booking link' : 'Off')] : []),
    ] }] : []),
  ]
})
</script>
