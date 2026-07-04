<template>
  <div class="booking-time-step flex h-full flex-col">
    <!-- Party size — pinned above the scroll -->
    <div class="flex shrink-0 items-center justify-between gap-4 border-y border-default px-1 py-3">
      <div>
        <div class="text-[11px] font-medium uppercase tracking-[0.2em] text-default">{{ guestsLabel }}</div>
        <div v-if="guestsHint" class="mt-0.5 text-xs text-muted">{{ guestsHint }}</div>
      </div>
      <div class="flex shrink-0 items-center gap-3">
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-full border border-default text-default disabled:opacity-30"
          :disabled="guests <= guestsMin"
          aria-label="Fewer guests"
          @click="$emit('update:guests', Math.max(guestsMin, guests - 1))"
        >
          <svg class="size-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 12h-15" /></svg>
        </button>
        <span class="saya-display min-w-8 text-center text-2xl">{{ guests >= guestsMax ? `${guestsMax}+` : guests }}</span>
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-full border border-default text-default disabled:opacity-30"
          :disabled="guests >= guestsMax"
          aria-label="More guests"
          @click="$emit('update:guests', Math.min(guestsMax, guests + 1))"
        >
          <svg class="size-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        </button>
      </div>
    </div>

    <!-- Month bar + calendar toggle -->
    <div class="flex shrink-0 items-center justify-between gap-4 border-b border-default px-1 py-3">
      <span class="saya-display text-lg">{{ monthLabel }}</span>
      <button
        type="button"
        class="flex size-9 items-center justify-center rounded-full border border-default text-default transition-colors"
        :class="calOpen ? 'bg-inverted text-inverted border-inverted' : ''"
        :aria-label="calOpen ? 'Show list' : 'Show calendar'"
        @click="calOpen = !calOpen"
      >
        <svg class="size-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor"><rect x="3" y="5" width="18" height="16" rx="2"/><path stroke-linecap="round" d="M8 3v4M16 3v4M3 10h18"/></svg>
      </button>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="flex flex-col gap-2 overflow-y-auto py-4">
      <div v-for="i in 4" :key="i" class="h-14 w-full shrink-0 animate-pulse rounded-lg bg-muted" />
    </div>

    <!-- Calendar view -->
    <div v-else-if="calOpen" class="flex-1 overflow-y-auto py-4">
      <div class="grid grid-cols-7 gap-y-2 justify-items-center">
        <span v-for="d in weekdayLabels" :key="d" class="pb-1.5 text-[10px] uppercase tracking-[0.2em] text-muted">{{ d }}</span>
        <span v-for="n in leadingBlanks" :key="`b-${n}`" />
        <button
          v-for="day in calendarDays"
          :key="day.key"
          type="button"
          class="flex size-11 items-center justify-center rounded-full text-sm transition-colors"
          :class="[
            day.hasSeats ? 'text-default cursor-pointer' : 'text-muted/40 cursor-default',
            day.key === selectedDayKey ? 'bg-inverted text-inverted' : '',
            day.isToday && day.key !== selectedDayKey ? 'border border-default' : '',
          ]"
          :disabled="!day.hasSeats"
          @click="jumpToDay(day.key)"
        >
          {{ day.dayNum }}
        </button>
      </div>
    </div>

    <!-- Day-grouped scrollable slot list -->
    <div v-else ref="scrollRef" class="flex-1 overflow-y-auto py-2">
      <p v-if="days.length === 0" class="py-6 text-sm text-muted">No availability in the next {{ dates.length }} days.</p>
      <section v-for="day in days" :key="day.key" :ref="(el) => setDayRef(el, day.key)" class="pt-4 first:pt-0">
        <h3 class="saya-display mb-3 text-lg">{{ day.label }}</h3>
        <div class="flex flex-col gap-2">
          <button
            v-for="slot in day.slots"
            :key="slot.time_slot"
            type="button"
            :disabled="slot.disabled"
            class="flex w-full items-center justify-between gap-4 rounded-lg border border-default px-4 py-3.5 text-left transition-colors"
            :class="[
              slot.disabled ? 'cursor-default bg-muted' : 'cursor-pointer hover:border-inverted',
              modelValue?.day === day.key && modelValue?.time === slot.time_slot ? 'border-inverted ring-1 ring-inverted' : '',
            ]"
            @click="selectSlot(day, slot)"
          >
            <span class="font-medium text-default" :class="slot.isClosedOrFull ? 'text-muted line-through' : ''">
              {{ formatTime(slot.time_slot) }}
            </span>
            <span
              class="text-sm"
              :class="slot.isClosedOrFull ? 'text-muted' : slot.scarce ? 'font-medium text-red-500' : 'text-muted'"
            >
              {{ slot.availabilityLabel }}
            </span>
          </button>
        </div>
      </section>
    </div>

    <!-- Sticky footer -->
    <div class="flex shrink-0 items-center justify-between gap-4 border-t border-default px-1 py-4">
      <div class="min-w-0">
        <template v-if="modelValue">
          <div class="saya-display saya-italic truncate text-lg">{{ selectedSummary }}</div>
          <div class="mt-0.5 text-xs text-muted">{{ guests >= guestsMax ? `${guestsMax}+` : guests }} {{ guests === 1 ? guestSingular : guestPlural }}</div>
        </template>
        <div v-else class="text-sm text-muted">{{ chooseSeatingLabel }}</div>
      </div>
      <SayaButton size="lg" :disabled="!modelValue" class="shrink-0" @click="$emit('next')">
        {{ continueLabel }}
      </SayaButton>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface RawSlotAvailability {
  time_slot: string
  capacity: number | null
  booked: number
  remaining: number | null
  is_closed: boolean
  is_full: boolean
}

export interface RawDateAvailability {
  date: string
  slots: RawSlotAvailability[]
}

export interface TimeSlotSelection {
  day: string
  label: string
  time: string
}

const props = withDefaults(defineProps<{
  dates: RawDateAvailability[]
  loading?: boolean
  modelValue?: TimeSlotSelection | null
  guests: number
  guestsMin?: number
  guestsMax?: number
  guestsLabel?: string
  guestsHint?: string
  guestSingular?: string
  guestPlural?: string
  continueLabel?: string
  chooseSeatingLabel?: string
}>(), {
  loading: false,
  modelValue: null,
  guestsMin: 1,
  guestsMax: 8,
  guestsLabel: 'Party size',
  guestsHint: '',
  guestSingular: 'guest',
  guestPlural: 'guests',
  continueLabel: 'Continue',
  chooseSeatingLabel: 'Choose a time to continue',
})

const emit = defineEmits<{
  'update:modelValue': [value: TimeSlotSelection]
  'update:guests': [value: number]
  next: []
}>()

const calOpen = ref(false)
const scrollRef = ref<HTMLElement | null>(null)
const dayRefs: Record<string, HTMLElement | null> = {}
function setDayRef(el: unknown, key: string) {
  dayRefs[key] = el as HTMLElement | null
}

function formatTime(time: string): string {
  const [hStr, mStr] = time.split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function dayLabelFor(dateStr: string, index: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (index === 0) return `Today, ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`
  if (index === 1) return `Tomorrow, ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

const days = computed(() => {
  return props.dates.map((d, i) => {
    const slots = d.slots.map((s) => {
      const isClosedOrFull = s.is_closed || s.is_full
      const tooSmall = !isClosedOrFull && s.remaining !== null && s.remaining < props.guests
      const scarce = !isClosedOrFull && !tooSmall && s.remaining !== null && s.remaining <= 3
      const disabled = isClosedOrFull || tooSmall
      const availabilityLabel = s.is_closed
        ? 'Closed'
        : s.is_full
          ? 'Sold out'
          : tooSmall
            ? `Only ${s.remaining} left`
            : scarce
              ? `${s.remaining} left`
              : 'Available'
      return { time_slot: s.time_slot, disabled, isClosedOrFull, scarce, availabilityLabel }
    })
    return { key: d.date, label: dayLabelFor(d.date, i), slots }
  }).filter((d) => d.slots.length > 0)
})

const monthLabel = computed(() => {
  if (props.dates.length === 0) return ''
  const first = new Date(`${props.dates[0]!.date}T00:00:00`)
  const last = new Date(`${props.dates[props.dates.length - 1]!.date}T00:00:00`)
  const f = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const l = last.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  if (f === l) return f
  return first.getFullYear() === last.getFullYear()
    ? `${first.toLocaleDateString('en-GB', { month: 'long' })} – ${l}`
    : `${f} – ${l}`
})

const selectedDayKey = computed(() => props.modelValue?.day ?? null)

const selectedSummary = computed(() => {
  if (!props.modelValue) return ''
  const dayPart = props.modelValue.label.split(',')[0]
  return `${dayPart} · ${formatTime(props.modelValue.time)}`
})

function selectSlot(day: { key: string; label: string }, slot: { time_slot: string; disabled: boolean }) {
  if (slot.disabled) return
  emit('update:modelValue', { day: day.key, label: day.label, time: slot.time_slot })
}

function jumpToDay(key: string) {
  calOpen.value = false
  nextTick(() => {
    const el = dayRefs[key]
    const box = scrollRef.value
    if (el && box) box.scrollTop = el.offsetTop - box.offsetTop - 4
  })
}

// ── Calendar view ──────────────────────────────────────────────────────────
const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const calendarDays = computed(() => {
  if (props.dates.length === 0) return []
  const byKey = Object.fromEntries(days.value.map((d) => [d.key, d]))
  const todayKey = props.dates[0]!.date
  const first = new Date(`${props.dates[0]!.date}T00:00:00`)
  const last = new Date(`${props.dates[props.dates.length - 1]!.date}T00:00:00`)
  const out: Array<{ key: string; dayNum: number; hasSeats: boolean; isToday: boolean }> = []
  const cursor = new Date(first.getFullYear(), first.getMonth(), first.getDate())
  while (cursor <= last) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
    const day = byKey[key]
    // hasSeats should reflect actual bookable availability (any non-disabled slot), not just presence
    const hasSeats = day ? day.slots?.some((slot: { disabled?: boolean }) => !slot.disabled) : false
    out.push({ key, dayNum: cursor.getDate(), hasSeats, isToday: key === todayKey })
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
})

const leadingBlanks = computed(() => {
  if (props.dates.length === 0) return 0
  return new Date(`${props.dates[0]!.date}T00:00:00`).getDay()
})
</script>
