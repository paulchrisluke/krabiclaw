<template>
  <!--
    The calendar's gear, Airbnb's Settings sheet (measured live 2026-10-01):
    a rail of cards, each showing its value and opening a picker of a few
    choices. Availability is when guests can book — the hours the slots come
    from, how far ahead, how many seats. Cancellations is one policy chosen
    by name. Closures are the calendar's own: block a day on it.
  -->
  <DashboardIndexPanel id="calendar-settings" title="Settings" :auto-open="groups[0]?.items[0]?.to ?? null">
    <div v-if="editor.loading.value" class="space-y-4">
      <USkeleton v-for="index in 4" :key="index" class="h-32 rounded-xl" />
    </div>
    <UAlert v-else-if="editor.error.value" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="editor.error.value" />
    <p v-else-if="!editor.location.value" class="text-sm text-muted">Choose a location on the calendar to change its settings.</p>
    <EditorNavigationList v-else :groups="groups" :active-item="level.child.value" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { useLocationEditor } from '~/lib/components/workspace/settings/LocationSettingsPage.vue'
import { cancellationSummary, hoursSummary, noticeSummary, seatsSummary } from '~/shared/availability-settings'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const level = useRouteLevel()
const organizationId = await useDashboardOrganizationId()
const locationId = computed(() => typeof route.query.locationId === 'string' ? route.query.locationId : null)
const editor = await useLocationEditor(organizationId, locationId, null)

const router = useRouter()
// Each leaf keeps the calendar's query — its location and view — so Close lands on the same calendar.
const to = (segment: string) => router.resolve({ path: `${level.path.value}/${segment}`, query: route.query }).fullPath
const groups = computed<EditorNavigationGroup[]>(() => [
  {
    id: 'availability',
    label: 'Availability',
    items: [
      { id: 'hours', label: 'Hours', summary: hoursSummary(editor.hoursForm.value.hours), to: to('hours') },
      { id: 'notice', label: 'Advance notice', summary: noticeSummary(editor.reservationForm.value.advance_notice_minutes), to: to('notice') },
      { id: 'seats', label: 'Seats per time slot', summary: seatsSummary(editor.reservationForm.value.slot_capacity), to: to('seats') },
    ],
  },
  {
    id: 'cancellations',
    label: 'Cancellations',
    items: [
      { id: 'cancellation', label: 'Cancellation policy', summary: cancellationSummary(editor.reservationForm.value), to: to('cancellation') },
    ],
  },
])
</script>
