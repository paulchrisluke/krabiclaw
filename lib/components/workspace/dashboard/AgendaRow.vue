<template>
  <NuxtLink :to="to ?? item.to" class="group grid min-h-[var(--ws-row-min-height,66px)] grid-cols-[5.5rem_1fr_auto] items-center gap-3 py-3" :class="cancelled ? 'text-muted line-through' : 'text-highlighted'">
    <div class="text-sm font-medium tabular-nums">
      {{ formattedTime }}
      <span v-if="item.showTimeZone" class="block text-[11px] font-normal text-muted">{{ item.timeZone }}</span>
    </div>
    <div class="min-w-0">
      <p class="truncate text-sm font-medium">{{ item.title }}</p>
      <p class="mt-0.5 truncate text-xs text-muted">{{ details }}</p>
    </div>
    <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed group-hover:text-highlighted" />
  </NuxtLink>
</template>

<script setup lang="ts">
import { formatTimestamp } from '~/utils/timezone'
import type { AgendaItem } from '~/server/utils/dashboard-agenda'

// The surface drawing the row says where it opens: under Today the record's
// own screen, under a calendar day the same record as a leaf of that day.
const props = defineProps<{ item: AgendaItem; to?: string }>()
const cancelled = computed(() => props.item.status === 'cancelled')
const formattedTime = computed(() => formatTimestamp(props.item.startsAt, 'en', props.item.timeZone, { hour: 'numeric', minute: '2-digit' }))
const details = computed(() => [cancelled.value ? 'Cancelled' : props.item.subtitle, props.item.locationTitle, agendaKindLabel(props.item.kind)].filter(Boolean).join(' · '))

function agendaKindLabel(kind: AgendaItem['kind']) {
  if (kind === 'booking') return 'Booking'
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}
</script>
