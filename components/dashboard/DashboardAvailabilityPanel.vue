<template>
  <div class="space-y-4">
    <div v-if="pending" class="space-y-2">
      <USkeleton class="h-12 w-full rounded-lg" />
      <USkeleton class="h-12 w-full rounded-lg" />
    </div>

    <p v-else-if="!slots.length" class="text-sm text-muted">
      Nothing runs on this date.
    </p>

    <div v-else class="space-y-2">
      <!--
        One row per time this experience runs on the chosen date. Blocked and
        full are kept apart on purpose: a tenant can reopen what they closed,
        but a session is full because guests booked it, and offering a control
        that cannot work is worse than showing none.
      -->
      <div
        v-for="slot in slots"
        :key="slot.time_slot"
        class="flex flex-wrap items-center gap-3 rounded-lg border border-default p-3"
      >
        <span class="w-16 shrink-0 font-medium tabular-nums text-highlighted">{{ slot.time_slot }}</span>

        <span class="inline-flex items-center gap-1.5 text-xs text-muted">
          <span class="size-1.5 rounded-full" :class="stateDot(slot)" />
          {{ stateLabel(slot) }}
        </span>

        <span class="text-xs text-muted">
          {{ slot.booked }} booked<span v-if="slot.capacity != null"> of {{ slot.capacity }}</span>
        </span>

        <UInputNumber
          v-model="capacityDrafts[slot.time_slot]"
          :min="0"
          placeholder="Capacity"
          class="ml-auto w-32"
          :aria-label="`Capacity for ${slot.time_slot}`"
        />

        <UButton
          size="xs"
          :color="slot.is_closed ? 'neutral' : 'error'"
          variant="soft"
          :loading="saving === slot.time_slot"
          :label="slot.is_closed ? 'Reopen' : 'Close'"
          @click="toggle(slot)"
        />
      </div>
    </div>

    <div v-if="upcoming.length" class="border-t border-default pt-4">
      <p class="mb-2 text-xs font-medium text-muted">Upcoming closures</p>
      <div class="space-y-1">
        <div
          v-for="override in upcoming"
          :key="override.id"
          class="flex items-center gap-3 rounded-lg border border-default px-3 py-2 text-sm"
        >
          <span class="text-muted">{{ override.override_date }}</span>
          <span class="font-medium tabular-nums text-highlighted">{{ override.time_slot }}</span>
          <UBadge :color="override.status === 'closed' ? 'error' : 'success'" variant="soft" size="xs">
            {{ override.status }}
          </UBadge>
          <span v-if="override.capacity_override != null" class="text-xs text-muted">cap {{ override.capacity_override }}</span>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            class="ml-auto"
            :aria-label="`Remove the override on ${override.override_date}`"
            @click="remove(override)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SlotAvailability, SlotOverride } from '~/server/utils/experiences'

const props = defineProps<{
  siteId: string
  experienceId: string
  /** ISO date (YYYY-MM-DD) in the site's own timezone, not UTC. */
  date: string
}>()

const emit = defineEmits<{ changed: [] }>()

const dashboardApi = useDashboardApi()
const toast = useToast()

const pending = ref(false)
const saving = ref<string | null>(null)
const slots = ref<SlotAvailability[]>([])
const upcoming = ref<SlotOverride[]>([])
const timezone = ref<string | null>(null)
const capacityDrafts = reactive<Record<string, number | null>>({})

const isAvailabilityResponse = (value: unknown): value is { timezone: string; dates: Array<{ date: string; slots: SlotAvailability[] }> } =>
  isRecord(value)
  && typeof value.timezone === 'string'
  && Array.isArray(value.dates)
  && value.dates.every(day => isRecord(day) && typeof day.date === 'string' && Array.isArray(day.slots) && day.slots.every(isRecord))
const isOverridesResponse = (value: unknown): value is { overrides: SlotOverride[] } =>
  isRecord(value) && Array.isArray(value.overrides) && value.overrides.every(item => isRecord(item) && typeof item.id === 'string')

function stateLabel(slot: SlotAvailability) {
  if (slot.is_closed) return 'Closed by you'
  return slot.is_full ? 'Full' : 'Open'
}

function stateDot(slot: SlotAvailability) {
  if (slot.is_closed) return 'bg-error'
  return slot.is_full ? 'bg-warning' : 'bg-success'
}

async function load() {
  if (!props.experienceId || !props.date) return
  // Switching dates quickly can land an older response last.
  const requested = `${props.experienceId}:${props.date}`
  pending.value = true
  try {
    const [availability, overrides] = await Promise.all([
      dashboardApi(`/api/editor/sites/${props.siteId}/experiences/${props.experienceId}/availability`, {
        query: { date: props.date }, validate: isAvailabilityResponse,
      }),
      dashboardApi(`/api/editor/sites/${props.siteId}/experiences/${props.experienceId}/slot-overrides`, {
        validate: isOverridesResponse,
      }),
    ])
    if (requested !== `${props.experienceId}:${props.date}`) return
    timezone.value = availability.timezone
    slots.value = availability.dates[0]?.slots ?? []
    upcoming.value = overrides.overrides ?? []
    for (const key of Object.keys(capacityDrafts)) Reflect.deleteProperty(capacityDrafts, key)
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to load availability'), color: 'error' })
  } finally {
    pending.value = false
  }
}

async function toggle(slot: SlotAvailability) {
  saving.value = slot.time_slot
  try {
    await dashboardApi(`/api/editor/sites/${props.siteId}/experiences/${props.experienceId}/slot-overrides`, {
      method: 'POST',
      body: {
        override_date: props.date,
        time_slot: slot.time_slot,
        status: slot.is_closed ? 'open' : 'closed',
        capacity_override: capacityDrafts[slot.time_slot] ?? null,
      },
      // The endpoint returns { override }; it has no `success` field, and
      // asserting one made every toggle fail its contract check.
      validate: (value): value is { override: Record<string, unknown> } =>
        isRecord(value) && isRecord(value.override),
    })
    await load()
    emit('changed')
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to update this time'), color: 'error' })
  } finally {
    saving.value = null
  }
}

async function remove(override: SlotOverride) {
  try {
    await dashboardApi(`/api/editor/sites/${props.siteId}/experiences/${props.experienceId}/slot-overrides/${override.id}`, {
      method: 'DELETE',
      validate: (value): value is { deleted: true } => isRecord(value) && value.deleted === true,
    })
    await load()
    emit('changed')
  } catch (error) {
    toast.add({ description: getErrorMessage(error, 'Failed to remove the override'), color: 'error' })
  }
}

watch(() => [props.experienceId, props.date], () => void load(), { immediate: true })

defineExpose({ timezone })
</script>
