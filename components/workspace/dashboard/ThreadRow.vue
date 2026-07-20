<template>
  <button
    type="button"
    class="flex w-full items-start gap-3 border-b border-default px-3.5 py-3.5 text-left transition hover:bg-elevated"
    :class="active ? 'bg-elevated' : ''"
    @click="$emit('select', thread.id)"
  >
    <div class="relative shrink-0">
      <div class="flex size-12 items-center justify-center rounded-full bg-muted text-sm font-semibold text-default">
        {{ thread.guest_name.charAt(0) }}
      </div>
      <div class="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-elevated">
        <UIcon 
          :name="typeIcon" 
          class="size-3"
          :class="typeIconColor"
        />
      </div>
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <p class="truncate text-sm font-semibold text-highlighted">{{ thread.guest_name }}</p>
            <span v-if="thread.unread_count > 0" class="size-2 rounded-full bg-primary" />
          </div>
          <p class="mt-1 truncate text-xs text-muted">{{ secondaryLine }}</p>
        </div>
        <span class="shrink-0 text-[11px] text-dimmed">{{ relativeTime }}</span>
      </div>

      <p class="mt-2 line-clamp-2 text-sm text-default" :class="thread.unread_count > 0 ? 'font-medium' : ''">{{ thread.last_message_preview || 'Open thread' }}</p>
      <p class="mt-1 text-xs text-dimmed">{{ contextLine }}</p>
    </div>
  </button>
</template>

<script setup lang="ts">
interface ThreadSummary {
  id: string
  submission_type: 'contact' | 'reservation' | 'experience_booking'
  guest_name: string
  unread_count: number
  last_message_at: string | null
  created_at: string
  last_message_preview: string | null
  location_title: string | null
  operational_status: string | null
  experience_title: string | null
  subject: string | null
}

const props = defineProps<{
  thread: ThreadSummary
  active: boolean
}>()

defineEmits<{
  select: [id: string]
}>()

const typeIcon = computed(() => {
  const type = props.thread.submission_type
  if (type === 'contact') return 'i-lucide-mail'
  if (type === 'reservation') return 'i-lucide-calendar-days'
  return 'i-lucide-bag'
})

const typeIconColor = computed(() => {
  const type = props.thread.submission_type
  if (type === 'contact') return 'text-info'
  if (type === 'reservation') return 'text-success'
  return 'text-warning'
})

const typeLabel = computed(() => {
  const type = props.thread.submission_type
  if (type === 'contact') return 'Contact'
  if (type === 'reservation') return 'Reservation'
  return 'Booking'
})

const secondaryLine = computed(() => {
  const t = props.thread
  if (t.submission_type === 'contact') return t.experience_title || t.subject || 'Website message'
  if (t.submission_type === 'reservation') return t.last_message_preview || 'Reservation thread'
  return t.experience_title || 'Experience booking'
})

const contextLine = computed(() => {
  const t = props.thread
  const parts = [
    typeLabel.value,
    t.location_title || 'Site-wide',
    t.operational_status
  ].filter(Boolean)
  return parts.join(' · ')
})

const relativeTime = computed(() => {
  const t = props.thread
  const timestamp = t.last_message_at || t.created_at
  const delta = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.round(delta / 60000)
  if (minutes < 60) return `${Math.max(minutes, 1)}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  return `${days}d`
})
</script>
