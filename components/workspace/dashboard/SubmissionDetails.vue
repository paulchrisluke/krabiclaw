<template>
  <UCard>
    <h3 class="text-[11px] font-semibold uppercase tracking-[0.1em] text-dimmed mb-2.5">{{ typeLabel + ' details' }}</h3>
    <div class="space-y-0">
      <template v-if="source.submission_type === 'contact'">
        <div class="flex justify-between gap-10 py-2 border-b border-dashed border-default">
          <span class="text-dimmed">Subject</span>
          <span class="text-right">{{ source.subject || '—' }}</span>
        </div>
        <div class="flex justify-between gap-10 py-2 border-b border-dashed border-default">
          <span class="text-dimmed">Regarding</span>
          <span class="text-right">{{ source.experience_title || '—' }}</span>
        </div>
        <div class="flex justify-between gap-10 py-2 border-b border-dashed border-default">
          <span class="text-dimmed">Submitted</span>
          <span class="text-right">{{ formatDate(source.created_at) }}</span>
        </div>
        <div class="flex justify-between gap-10 py-2">
          <span class="text-dimmed">Message</span>
          <span class="text-right">{{ source.message }}</span>
        </div>
      </template>
      <template v-else-if="source.submission_type === 'reservation'">
        <div class="flex justify-between gap-10 py-2 border-b border-dashed border-default">
          <span class="text-dimmed">Date & time</span>
          <span class="text-right">{{ source.date }} · {{ source.time }}</span>
        </div>
        <div class="flex justify-between gap-10 py-2 border-b border-dashed border-default">
          <span class="text-dimmed">Party size</span>
          <span class="text-right">{{ source.guests }}</span>
        </div>
        <div class="flex justify-between gap-10 py-2 border-b border-dashed border-default">
          <span class="text-dimmed">Location</span>
          <span class="text-right">{{ source.location_title }}</span>
        </div>
        <div class="flex justify-between gap-10 py-2">
          <span class="text-dimmed">Special requests</span>
          <span class="text-right">{{ source.requests || 'None' }}</span>
        </div>
      </template>
      <template v-else>
        <div class="flex justify-between gap-10 py-2 border-b border-dashed border-default">
          <span class="text-dimmed">Date & time</span>
          <span class="text-right">{{ source.booking_date }} · {{ source.time_slot }}</span>
        </div>
        <div class="flex justify-between gap-10 py-2 border-b border-dashed border-default">
          <span class="text-dimmed">Party size</span>
          <span class="text-right">{{ source.party_size }}</span>
        </div>
        <div class="flex justify-between gap-10 py-2 border-b border-dashed border-default">
          <span class="text-dimmed">Location</span>
          <span class="text-right">{{ source.location_title }}</span>
        </div>
        <div class="flex justify-between gap-10 py-2">
          <span class="text-dimmed">Notes</span>
          <span class="text-right">{{ source.notes || 'None' }}</span>
        </div>
      </template>
    </div>
  </UCard>
</template>

<script setup lang="ts">
interface SubmissionSource {
  submission_type: 'contact' | 'reservation' | 'experience_booking'
  subject: string | null
  experience_title: string | null
  created_at: string
  message: string | null
  date: string | null
  time: string | null
  guests: string | null
  location_title: string | null
  requests: string | null
  booking_date: string | null
  time_slot: string | null
  party_size: string | null
  notes: string | null
}

const props = defineProps<{
  source: SubmissionSource
}>()

const typeLabel = computed(() => {
  const type = props.source.submission_type
  if (type === 'contact') return 'Contact'
  if (type === 'reservation') return 'Reservation'
  return 'Booking'
})

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}
</script>
