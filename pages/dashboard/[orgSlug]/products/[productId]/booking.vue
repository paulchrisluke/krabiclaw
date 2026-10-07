<template>
  <DashboardIndexPanel id="product-booking" title="Bookings" :auto-open="groups[0]?.items[0]?.to ?? null">
    <UAlert v-if="p.loadError.value" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="p.loadError.value" />
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
const route = useRoute()
const router = useRouter()
const to = (name: string) => router.resolve({ path: `${level.path.value}/${name}`, query: route.query }).fullPath
const row = (id: string, label: string, summary: string) => ({ id, label, summary, to: to(id) })
const groups = computed<EditorNavigationGroup[]>(() => {
  const config = p.product.value?.booking
  const items: EditorNavigationItem[] = config ? [] : [row('enabled', 'Booking calendar', 'Not set up')]
  if (config) items.push(
    row('duration', 'Duration', config.duration_minutes ? `${config.duration_minutes} minutes` : 'Choose a duration'),
    p.locationId.value ? { id: 'location', label: 'Meeting location', summary: p.location.value?.title ?? '' } : row('location', 'Meeting location', config.online_timezone ? `Online · ${timezoneLabel(config.online_timezone)}` : 'Choose a time zone'),
    row('capacity', 'Guest limit', config.default_capacity === null ? 'No guest limit' : config.default_capacity === 1 ? 'One guest per session' : config.default_capacity === 0 ? 'Closed to new guests' : `Up to ${config.default_capacity} guests per session`),
    row('assignment', 'Who guests meet', config.assigned_member_id ? 'Assigned team member' : 'Tenant organization'),
    row('confirmation', 'Confirmation', config.confirmation_mode === 'instant' ? 'Confirm automatically' : 'Review each request'),
    row('schedule', 'Weekly schedule', p.scheduleError.value ? p.scheduleError.value : p.weekdays.filter(day => p.savedSlotsFor(day.value).length).map(day => day.label).join(', ') || 'No weekly times set'),
  )
  // One flat list. Whether guests book on the website at all is the
  // organization's setting, under Website, not this product's.
  if (config) items.push(
    row('enabled', 'Booking calendar', 'Set up'),
    row('payment', 'Payment', config.online_payment_required ? 'Online payment required for paid sessions' : 'No payment collected at booking'),
    ...(!p.locationId.value && config.online_timezone ? [row('calendar', 'Shared availability', config.calendar_group || 'Independent schedule')] : []),
  )
  return [{ id: 'booking', items }]
})
</script>
