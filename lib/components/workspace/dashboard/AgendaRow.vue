<template>
  <NuxtLink :to="item.to" class="group grid min-h-[var(--ws-row-min-height,66px)] grid-cols-[5.5rem_1fr_auto] items-center gap-3 py-3">
    <div class="text-sm font-medium tabular-nums text-highlighted">
      {{ formattedTime }}
      <span v-if="item.showTimeZone" class="block text-[11px] font-normal text-muted">{{ item.timeZone }}</span>
    </div>
    <div class="min-w-0">
      <p class="truncate text-sm font-medium text-highlighted">{{ item.title }}</p>
      <p class="mt-0.5 truncate text-xs text-muted">{{ details }}</p>
    </div>
    <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed group-hover:text-highlighted" />
  </NuxtLink>
</template>

<script setup lang="ts">
import type { AgendaItem } from '~/server/utils/dashboard-agenda'

const props = defineProps<{ item: AgendaItem }>()
const formattedTime = computed(() => new Intl.DateTimeFormat('en-US', {
  timeZone: props.item.timeZone, hour: 'numeric', minute: '2-digit',
}).format(new Date(props.item.startsAt)))
const details = computed(() => [props.item.subtitle, props.item.locationTitle, agendaKindLabel(props.item.kind)].filter(Boolean).join(' · '))

function agendaKindLabel(kind: AgendaItem['kind']) {
  if (kind === 'experience_booking') return 'Experience booking'
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}
</script>
