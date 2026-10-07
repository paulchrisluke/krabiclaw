<template>
  <DashboardIndexPanel id="booking-schedule" title="Weekly schedule" :auto-open="groups[0]?.items[0]?.to ?? null">
    <UAlert v-if="p.loadError.value || p.scheduleError.value" color="error" variant="soft" :description="p.loadError.value || p.scheduleError.value || ''" />
    <EditorNavigationList v-else :groups="groups" :active-item="level.child.value" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'
import { formatTime } from '~/utils/timezone'

definePageMeta({ layout: 'dashboard' })
const p = inject(productEditorKey)!
const level = useRouteLevel()
const route = useRoute()
const router = useRouter()
const groups = computed<EditorNavigationGroup[]>(() => [{ id: 'week', items: p.weekdays.map(day => ({
  id: day.label.toLowerCase(), label: day.label,
  summary: p.savedSlotsFor(day.value).length ? p.savedSlotsFor(day.value).map(slot => formatTime(slot.start_time, 'en-US')).join(', ') : 'No sessions',
  to: router.resolve({ path: `${level.path.value}/${day.label.toLowerCase()}`, query: route.query }).fullPath,
})) }])
</script>
