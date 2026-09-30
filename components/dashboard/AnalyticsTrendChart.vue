<template>
  <div>
    <div class="mb-3 min-h-12 text-sm" aria-live="polite">
      <template v-if="selectedDate">
        <p class="font-medium text-highlighted">{{ dateLabel(selectedDate) }}</p>
        <p class="mt-1 text-muted">{{ selectedSummary }}</p>
      </template>
      <p v-else class="text-muted">Explore a day to see its activity.</p>
    </div>
    <svg v-if="dates.length" viewBox="0 0 800 260" class="w-full overflow-visible" role="group" :aria-label="label" @mouseleave="selectedIndex = null">
      <g v-for="step in [0, 1, 2, 3, 4]" :key="step">
        <line x1="60" :y1="y(maximum * step / 4)" x2="780" :y2="y(maximum * step / 4)" class="stroke-default" />
        <text x="48" :y="y(maximum * step / 4) + 5" text-anchor="end" class="fill-muted text-[20px]">{{ compactCount(maximum * step / 4) }}</text>
      </g>
      <polyline v-for="line in series" :key="line.label" :points="line.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')"
        fill="none" :stroke="line.color" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <g v-for="(date, index) in dates" :key="date" tabindex="0" role="button"
        :aria-label="`${dateLabel(date)}: ${daySummary(index)}`"
        @focus="selectedIndex = index" @blur="selectedIndex = null" @mouseenter="selectedIndex = index"
        @click="selectedIndex = index" @keydown.enter="selectedIndex = index" @keydown.space.prevent="selectedIndex = index">
        <rect :x="x(index) - 360 / dates.length" y="35" :width="720 / dates.length" height="190" fill="transparent" />
        <line v-if="selectedIndex === index" :x1="x(index)" y1="40" :x2="x(index)" y2="218" class="stroke-muted" />
        <circle v-for="line in series" :key="line.label" :cx="x(index)" :cy="y(valueAt(line.values, index))"
          :r="selectedIndex === index ? 5 : 2" :fill="line.color" />
      </g>
      <text x="60" y="248" class="fill-muted text-[20px]">{{ dateLabelAt(0) }}</text>
      <text x="420" y="248" text-anchor="middle" class="fill-muted text-[20px]">{{ dateLabelAt(Math.floor((dates.length - 1) / 2)) }}</text>
      <text x="780" y="248" text-anchor="end" class="fill-muted text-[20px]">{{ dateLabelAt(dates.length - 1) }}</text>
    </svg>
    <div class="mt-3 flex flex-wrap gap-4 text-xs text-muted">
      <span v-for="line in series" :key="line.label" class="inline-flex items-center gap-2">
        <span class="size-2 rounded-full" :style="{ backgroundColor: line.color }" />{{ line.label }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatCalendarDate } from '~/utils/timezone'

const props = defineProps<{ label: string; dates: string[]; series: Array<{ label: string; values: number[]; color: string }> }>()
const selectedIndex = ref<number | null>(null)
const selectedDate = computed(() => selectedIndex.value === null ? null : props.dates[selectedIndex.value])
const selectedSummary = computed(() => selectedIndex.value === null ? '' : daySummary(selectedIndex.value))
const valueAt = (values: number[], index: number) => values[index]!
const daySummary = (index: number) => props.series.map(line => `${count(valueAt(line.values, index))} ${line.label.toLowerCase()}`).join(' · ')
const dateLabelAt = (index: number) => dateLabel(props.dates[index]!)
const maximum = computed(() => Math.max(4, Math.ceil(Math.max(0, ...props.series.flatMap(line => line.values)) / 4) * 4))
const x = (index: number) => 60 + (props.dates.length > 1 ? index * 720 / (props.dates.length - 1) : 0)
const y = (value: number) => 218 - value / maximum.value * 178
const count = (value: number) => new Intl.NumberFormat('en-US').format(value)
const compactCount = (value: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const dateLabel = (value: string) => formatCalendarDate(value, 'en', { month: 'short', day: 'numeric' })
</script>
