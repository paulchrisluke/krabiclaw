<template>
  <ConversationShell
    v-model:input="draft"
    :messages="entries"
    :placeholder="placeholder"
    :disabled="disabled"
    :loading="loading"
    :show-empty-state="entries.length === 0"
    :show-default-empty-icon="false"
    :empty-title="emptyTitle"
    :empty-description="emptyDescription"
    :cancelable="false"
    submit-label="Send reply"
    @submit="$emit('submit')"
  >
    <template #prompt-submit>
      <button
        type="button"
        class="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary transition-none hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-75"
        :disabled="disabled || loading || !draft.trim()"
        aria-label="Send reply"
        title="Send reply"
        @click="$emit('submit')"
      >
        <UIcon name="i-lucide-send-horizontal" class="size-4 transition-none" />
      </button>
    </template>

    <template #message="{ message }">
      <!-- Structured, immutable opening submission card — issue #442's "reservation with
           zero replies is still a complete thread" requirement. Rendered once, first. -->
      <div v-if="message.kind === 'submission'" class="px-4 py-2">
        <div class="mx-auto max-w-[34rem] rounded-xl border border-default bg-elevated px-4 py-3">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-highlighted">{{ openingTitle }}</p>
              <p v-if="contextLabel" class="mt-0.5 text-xs text-muted">{{ contextLabel }}</p>
            </div>
          </div>

          <dl class="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div v-for="row in openingRows(message.payload)" :key="row.label" :class="row.wide ? 'sm:col-span-2' : ''">
              <dt class="text-[11px] font-medium uppercase tracking-wide text-dimmed">{{ row.label }}</dt>
              <dd class="mt-0.5 whitespace-pre-wrap break-words text-default">{{ row.value }}</dd>
            </div>
          </dl>

          <div v-if="actionItems.length" class="mt-4 flex flex-wrap gap-2 border-t border-dashed border-default pt-3">
            <UButton
              v-for="action in actionItems"
              :key="action.value"
              size="sm"
              :color="action.color"
              :variant="action.variant"
              :icon="action.icon"
              :loading="pendingAction === action.value"
              @click="$emit('action', action.value)"
            >
              {{ action.label }}
            </UButton>
          </div>
        </div>
      </div>

      <!-- Compact system events: operation transitions, delivery outcomes, resolve/reopen. -->
      <div v-else-if="message.kind === 'operation' || message.kind === 'delivery' || message.kind === 'resolution'" class="px-4 py-2">
        <div class="mx-auto flex max-w-[26rem] items-center justify-center gap-2 rounded-full bg-muted px-3 py-1.5 text-center text-xs font-medium text-muted">
          <UIcon :name="systemEventIcon(message)" class="size-3.5 shrink-0" :class="systemEventIconClass(message)" />
          <span>{{ systemEventLabel(message) }}</span>
          <UButton
            v-if="isRetryableDelivery(message)"
            size="xs"
            color="neutral"
            variant="soft"
            class="ml-1 rounded-full"
            :loading="retryingDeliveryId === deliveryIdFromEntry(message)"
            @click="$emit('retry-delivery', deliveryIdFromEntry(message)!)"
          >
            Retry
          </UButton>
        </div>
      </div>

      <!-- Guest/owner message bubbles. -->
      <div
        v-else
        class="flex px-4 py-2"
        :class="message.actorKind === 'member' ? 'justify-end' : 'justify-start'"
      >
        <div class="flex max-w-[78%] items-start gap-3" :class="message.actorKind === 'member' ? 'flex-row-reverse' : ''">
          <div
            class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border"
            :class="message.actorKind === 'member' ? 'border-primary/20 bg-primary/10 text-primary' : 'border-default bg-elevated text-muted'"
          >
            <UIcon :name="message.actorKind === 'member' ? 'i-lucide-mail' : 'i-lucide-user-round'" class="size-4" />
          </div>

          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2 text-[11px] text-muted" :class="message.actorKind === 'member' ? 'justify-end' : ''">
              <span class="font-semibold text-highlighted">{{ actorLabel(message) }}</span>
              <span>{{ channelLabel(message.channel) }}</span>
              <span>{{ formatRelativeTime(message.occurredAt) }}</span>
            </div>
            <div
              class="rounded-[14px] border px-4 py-3 text-sm leading-relaxed"
              :class="message.actorKind === 'member'
                ? 'rounded-tr-[5px] border-primary bg-primary text-(--primary-foreground,#fff)'
                : 'rounded-tl-[5px] border-default bg-elevated text-default'"
            >
              {{ message.body }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #prompt-after>
      <p v-if="disabledReason" class="mt-2 text-xs text-warning">{{ disabledReason }}</p>
    </template>
  </ConversationShell>
</template>

<script setup lang="ts">
import ConversationShell from '~/components/conversation/ConversationShell.vue'

type EntryKind = 'submission' | 'message' | 'operation' | 'delivery' | 'assignment' | 'resolution'
type ActorKind = 'guest' | 'member' | 'system'
type Channel = 'web' | 'email' | 'whatsapp' | 'system'

export interface GuestThreadEntryMessage {
  id: string
  kind: EntryKind
  actorKind: ActorKind
  actorLabel: string | null
  channel: Channel | null
  body: string | null
  eventName: string | null
  payload: Record<string, unknown> | null
  occurredAt: string
  // ConversationShell's generic message type requires a `role` field; unused for rendering
  // (the #message slot below is fully overridden) but keeps the shared shell's type happy.
  role: string
}

const draft = defineModel<string>('input', { required: true })

const props = withDefaults(defineProps<{
  entries: GuestThreadEntryMessage[]
  submissionType: 'contact' | 'reservation' | 'experience_booking'
  placeholder?: string
  loading?: boolean
  disabled?: boolean
  disabledReason?: string | null
  retryingDeliveryId?: string | null
  emptyTitle?: string
  emptyDescription?: string
  guestEmail?: string | null
  guestPhone?: string | null
  locationLabel?: string | null
  contextLabel?: string | null
  sourceFields?: Record<string, unknown>
  actionItems?: Array<{ value: string; label: string; icon: string; color: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'; variant: 'soft' | 'outline' | 'ghost' }>
  pendingAction?: string | null
}>(), {
  placeholder: 'Write your reply…',
  loading: false,
  disabled: false,
  disabledReason: null,
  retryingDeliveryId: null,
  emptyTitle: 'No messages yet',
  emptyDescription: 'Guest replies will appear here.',
  guestEmail: null,
  guestPhone: null,
  locationLabel: null,
  contextLabel: null,
  sourceFields: () => ({}),
  actionItems: () => [],
  pendingAction: null,
})

defineEmits<{
  submit: []
  action: [action: string]
  'retry-delivery': [deliveryId: string]
}>()

const { formatRelativeTime } = useHumanTime()

const openingTitle = computed(() => {
  if (props.submissionType === 'reservation') return 'Reservation request'
  if (props.submissionType === 'experience_booking') return 'Experience booking request'
  return 'Website message'
})

function openingRows(payload: Record<string, unknown> | null): Array<{ label: string; value: string; wide?: boolean }> {
  const fields = { ...(payload ?? {}), ...props.sourceFields }
  const rows: Array<{ label: string; value: string | null; wide?: boolean }> = [
    { label: 'Email', value: props.guestEmail },
    { label: 'Phone', value: props.guestPhone },
    { label: 'Location', value: props.locationLabel },
  ]

  if (props.submissionType === 'reservation') {
    rows.push(
      { label: 'Date', value: stringField(fields.date) },
      { label: 'Time', value: stringField(fields.time) },
      { label: 'Guests', value: stringField(fields.guests) },
      { label: 'Requests', value: stringField(fields.requests), wide: true },
    )
  } else if (props.submissionType === 'experience_booking') {
    rows.push(
      { label: 'Experience', value: stringField(fields.experienceTitle), wide: true },
      { label: 'Date', value: stringField(fields.bookingDate) },
      { label: 'Time', value: stringField(fields.timeSlot) },
      { label: 'Party size', value: stringField(fields.partySize) },
      { label: 'Notes', value: stringField(fields.notes), wide: true },
    )
  } else {
    rows.push(
      { label: 'Subject', value: stringField(fields.subject), wide: true },
      { label: 'Message', value: stringField(fields.message), wide: true },
    )
  }

  return rows
    .filter((row): row is { label: string; value: string; wide?: boolean } => Boolean(row.value))
    .map(row => ({ ...row, value: row.label === 'Date' ? formatOpeningDate(row.value) : row.value }))
}

function stringField(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

function formatOpeningDate(value: string | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

function actorLabel(message: GuestThreadEntryMessage) {
  if (message.actorKind === 'guest') return 'Guest'
  if (message.actorKind === 'member') return message.actorLabel || 'Owner'
  return 'System'
}

function channelLabel(channel: Channel | null) {
  if (channel === 'email') return 'Email'
  if (channel === 'whatsapp') return 'WhatsApp'
  if (channel === 'web') return 'Website'
  return 'System'
}

function systemEventIcon(message: GuestThreadEntryMessage) {
  if (message.kind === 'delivery') {
    return message.eventName?.includes('failed') ? 'i-lucide-mail-warning' : 'i-lucide-mail-check'
  }
  if (message.kind === 'resolution') {
    return message.eventName === 'thread.resolved' ? 'i-lucide-check-check' : 'i-lucide-rotate-ccw'
  }
  return 'i-lucide-circle-check'
}

function systemEventIconClass(message: GuestThreadEntryMessage) {
  if (message.kind === 'delivery' && message.eventName?.includes('failed')) return 'text-error'
  return 'text-muted'
}

function systemEventLabel(message: GuestThreadEntryMessage) {
  const payload = message.payload ?? {}
  const actor = message.actorLabel ? `${message.actorLabel} ` : ''

  if (message.kind === 'operation') {
    const action = String(payload.action ?? '')
    if (message.eventName === 'migration_snapshot') return 'Imported from previous system'
    if (action === 'confirm') return `${actor}confirmed the ${labelForSubmissionType()}`.trim()
    if (action === 'cancel') return `${actor}cancelled the ${labelForSubmissionType()}`.trim()
    if (action === 'complete') return `${actor}marked the ${labelForSubmissionType()} complete`.trim()
    return message.eventName ?? 'Operation recorded'
  }

  if (message.kind === 'delivery') {
    const failed = message.eventName?.includes('failed')
    const retry = message.eventName?.includes('retry')
    if (failed) return retry ? 'Retry failed to send' : 'Notification email failed to send'
    return retry ? 'Retry sent' : 'Confirmation email sent'
  }

  if (message.kind === 'resolution') {
    if (message.eventName === 'thread.resolved') return `${actor}resolved this thread`.trim()
    return `${actor}reopened this thread`.trim()
  }

  return message.eventName ?? ''
}

function labelForSubmissionType() {
  if (props.submissionType === 'reservation') return 'reservation'
  if (props.submissionType === 'experience_booking') return 'booking'
  return 'submission'
}

function isRetryableDelivery(message: GuestThreadEntryMessage) {
  return message.kind === 'delivery' && Boolean(message.eventName?.includes('failed')) && Boolean(message.payload?.deliveryId)
}

function deliveryIdFromEntry(message: GuestThreadEntryMessage): string | null {
  const id = message.payload?.deliveryId
  return typeof id === 'string' ? id : null
}
</script>
