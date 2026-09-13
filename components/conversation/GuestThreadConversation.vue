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
      <div v-if="message.kind === 'submission'" class="px-4 py-2">
        <div class="mx-auto max-w-[34rem] rounded-xl border border-default bg-elevated px-4 py-3">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-highlighted">{{ openingTitle }}</p>
              <p v-if="contextLabel" class="mt-0.5 text-xs text-muted">{{ contextLabel }}</p>
            </div>
          </div>

          <dl class="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div v-for="row in openingRows()" :key="row.label" :class="row.wide ? 'sm:col-span-2' : ''">
              <dt class="text-[11px] font-medium uppercase tracking-wide text-dimmed">{{ row.label }}</dt>
              <dd class="mt-0.5 whitespace-pre-wrap break-words text-default">{{ row.value }}</dd>
            </div>
          </dl>


          <ul v-if="message.deliveries.length" class="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-dashed border-default pt-3">
            <li
              v-for="delivery in message.deliveries"
              :key="delivery.id"
              class="flex items-center gap-1 text-[11px]"
              :class="deliveryTone(delivery)"
            >
              <UIcon :name="deliveryIcon(delivery)" class="size-3 shrink-0" />
              <span>{{ deliveryLabel(delivery) }}</span>
            </li>
          </ul>
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

      <div v-else-if="message.kind === 'operation' || message.kind === 'resolution'" class="px-4 py-2">
        <div class="mx-auto flex max-w-[26rem] items-center justify-center gap-2 rounded-full bg-muted px-3 py-1.5 text-center text-xs font-medium text-muted">
          <UIcon :name="systemEventIcon(message)" class="size-3.5 shrink-0 text-muted" />
          <span>{{ systemEventLabel(message) }}</span>
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
            <div
              v-if="message.deliveries.length"
              class="flex flex-wrap items-center gap-x-3 gap-y-1"
              :class="message.actorKind === 'member' ? 'justify-end' : ''"
            >
              <span
                v-for="delivery in message.deliveries"
                :key="delivery.id"
                class="flex items-center gap-1 text-[11px]"
                :class="deliveryTone(delivery)"
              >
                <UIcon :name="deliveryIcon(delivery)" class="size-3 shrink-0" />
                {{ deliveryLabel(delivery) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #prompt-before>
      <div v-if="deliveryFailures.length" class="mb-3 space-y-2" aria-live="polite">
        <UAlert
          v-for="failure in deliveryFailures"
          :key="failure.id"
          :color="failure.status === 'failed' ? 'error' : 'warning'"
          variant="soft"
          icon="i-lucide-mail-warning"
          :title="deliveryFailureTitle(failure)"
          :description="deliveryFailureDescription(failure)"
        >
          <template v-if="failure.retryable" #actions>
            <UButton
              size="xs"
              :color="failure.status === 'failed' ? 'error' : 'warning'"
              variant="soft"
              :loading="retryingDeliveryId === failure.id"
              :disabled="retryingDeliveryId !== null && retryingDeliveryId !== failure.id"
              @click="$emit('retry-delivery', failure.id)"
            >
              Retry sending
            </UButton>
          </template>
        </UAlert>
      </div>
    </template>

    <template #prompt-after>
      <p v-if="disabledReason" class="mt-2 text-xs text-warning">{{ disabledReason }}</p>
    </template>
  </ConversationShell>
</template>

<script setup lang="ts">
import ConversationShell from '~/components/conversation/ConversationShell.vue'
import type { ThreadDetailSourceFields } from '~/server/domain/guest-threads/types'

type EntryKind = 'submission' | 'message' | 'operation' | 'assignment' | 'resolution'
type ActorKind = 'guest' | 'member' | 'system'
type Channel = 'web' | 'email' | 'whatsapp' | 'system'

export interface GuestThreadDeliveryFailure {
  id: string
  channel: 'email' | 'whatsapp'
  purpose: 'owner_alert' | 'guest_acknowledgement' | 'member_reply' | 'status_update'
  error: string | null
  status: 'failed' | 'unknown'
  retryable: boolean
  createdAt: string
}

export interface GuestThreadEntryDelivery {
  id: string
  channel: 'email' | 'whatsapp'
  purpose: 'owner_alert' | 'guest_acknowledgement' | 'member_reply' | 'status_update'
  status: 'pending' | 'accepted' | 'sent' | 'delivered' | 'read' | 'failed' | 'unknown'
}

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
  deliveries: GuestThreadEntryDelivery[]
  // ConversationShell's generic message type requires a `role` field; unused for rendering
  // (the #message slot below is fully overridden) but keeps the shared shell's type happy.
  role: string
}

const DELIVERY_PURPOSE_LABELS = {
  owner_alert: 'owner alert',
  guest_acknowledgement: 'guest acknowledgement',
  member_reply: 'reply',
  status_update: 'status update',
} satisfies Record<GuestThreadDeliveryFailure['purpose'], string>

// The provider's own words for what happened, not a summary of them: 'sent'
// and 'read' are different facts and the thread says which one it has.
const DELIVERY_STATUS_LABELS = {
  pending: 'queued',
  accepted: 'accepted',
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
  unknown: 'unconfirmed',
} satisfies Record<GuestThreadEntryDelivery['status'], string>

const draft = defineModel<string>('input', { required: true })

const props = withDefaults(defineProps<{
  entries: GuestThreadEntryMessage[]
  deliveryFailures?: GuestThreadDeliveryFailure[]
  submissionType: 'contact' | 'reservation' | 'booking'
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
  sourceFields?: ThreadDetailSourceFields
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
  deliveryFailures: () => [],
})

defineEmits<{
  submit: []
  action: [action: string]
  'retry-delivery': [deliveryId: string]
}>()

const { formatRelativeTime } = useHumanTime()

const openingTitle = computed(() => {
  if (props.submissionType === 'reservation') return 'Reservation request'
  if (props.submissionType === 'booking') return 'Booking request'
  return 'Website message'
})

function openingRows(): Array<{ label: string; value: string; wide?: boolean }> {
  const fields = props.sourceFields
  const rows: Array<{ label: string; value: string | null; wide?: boolean }> = [
    { label: 'Email', value: props.guestEmail },
    { label: 'Phone', value: props.guestPhone },
    { label: 'Location', value: props.locationLabel },
  ]

  if (props.submissionType === 'contact') {
    rows.push(
      { label: 'Subject', value: stringField(fields.subject), wide: true },
      { label: 'Message', value: stringField(fields.message), wide: true },
    )
  } else {
    // A reservation and an experience booking are the same shape here: an
    // occurrence the operational record owns. The server already formatted
    // `whenLabel` in that record's timezone, so nothing is re-derived here.
    rows.push(
      { label: 'Experience', value: stringField(fields.productTitle), wide: true },
      { label: 'When', value: stringField(fields.whenLabel) },
      { label: 'Guests', value: stringField(fields.guests) },
      { label: 'Requests', value: stringField(fields.notes), wide: true },
    )
  }

  return rows.filter((row): row is { label: string; value: string; wide?: boolean } => Boolean(row.value))
}

function stringField(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

function actorLabel(message: GuestThreadEntryMessage) {
  if (message.actorKind === 'guest') return 'Guest'
  if (message.actorKind === 'member') return message.actorLabel || 'Owner'
  return 'System'
}

function deliveryLabel(delivery: GuestThreadEntryDelivery) {
  const channel = delivery.channel === 'whatsapp' ? 'WhatsApp' : 'Email'
  return `${channel} ${DELIVERY_PURPOSE_LABELS[delivery.purpose]} \u00b7 ${DELIVERY_STATUS_LABELS[delivery.status]}`
}

function deliveryTone(delivery: GuestThreadEntryDelivery) {
  if (delivery.status === 'failed' || delivery.status === 'unknown') return 'text-warning'
  if (delivery.status === 'delivered' || delivery.status === 'read') return 'text-success'
  return 'text-muted'
}

function deliveryIcon(delivery: GuestThreadEntryDelivery) {
  if (delivery.status === 'failed' || delivery.status === 'unknown') return 'i-lucide-triangle-alert'
  if (delivery.status === 'read') return 'i-lucide-check-check'
  if (delivery.status === 'delivered' || delivery.status === 'sent' || delivery.status === 'accepted') return 'i-lucide-check'
  return 'i-lucide-clock'
}

function channelLabel(channel: Channel | null) {
  if (channel === 'email') return 'Email'
  if (channel === 'whatsapp') return 'WhatsApp'
  if (channel === 'web') return 'Website'
  return 'System'
}

function systemEventIcon(message: GuestThreadEntryMessage) {
  if (message.kind === 'resolution') {
    return message.eventName === 'thread.resolved' ? 'i-lucide-check-check' : 'i-lucide-rotate-ccw'
  }
  return 'i-lucide-circle-check'
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

  if (message.kind === 'resolution') {
    if (message.eventName === 'thread.resolved') return `${actor}resolved this thread`.trim()
    return `${actor}reopened this thread`.trim()
  }

  return message.eventName ?? ''
}

function labelForSubmissionType() {
  if (props.submissionType === 'reservation') return 'reservation'
  if (props.submissionType === 'booking') return 'booking'
  return 'submission'
}

function deliveryFailureTitle(failure: GuestThreadDeliveryFailure) {
  const channel = failure.channel === 'whatsapp' ? 'WhatsApp' : 'Email'
  const delivery = `${channel} ${DELIVERY_PURPOSE_LABELS[failure.purpose]}`
  return failure.status === 'failed'
    ? `${delivery} could not be sent`
    : `${delivery} delivery could not be confirmed`
}

function deliveryFailureDescription(failure: GuestThreadDeliveryFailure) {
  if (failure.error) return failure.error
  return failure.status === 'failed'
    ? `The ${failure.channel} provider rejected this delivery.`
    : `The ${failure.channel} provider did not report a final delivery outcome.`
}
</script>
