<template>
  <div class="flex min-h-0 w-full min-w-0 flex-1 flex-col">
    <!--
      Who this is with, and the way to the record behind it. The reservation is
      not a card in the stream: the stream holds what people said, and every
      fact about the booking lives one control away, at its own URL.
    -->
    <!--
      Measured on Airbnb: a 40px avatar in the left gutter, a 22px/500 title,
      a 12px subline, and a fully-rounded 40px grey pill trailing. Not a small
      ringed rectangle, which is what this was.
    -->
    <header class="flex shrink-0 items-center gap-3 border-b border-default px-4 py-4 sm:px-6">
      <UAvatar :alt="guestName" size="lg" class="shrink-0" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-[22px] font-medium leading-tight text-highlighted">{{ guestName }}</p>
        <p v-if="subline" class="truncate text-xs text-muted">{{ subline }}</p>
      </div>
      <UButton
        v-if="recordTo"
        :to="recordTo"
        color="neutral"
        variant="soft"
        class="h-10 shrink-0 rounded-full px-4"
        :aria-label="`Show ${recordNoun}`"
      >
        <span class="hidden sm:inline">Show {{ recordNoun }}</span>
        <span class="sm:hidden">Details</span>
      </UButton>
    </header>

    <div ref="scrollContainer" class="min-h-0 flex-1 overflow-y-auto">
      <div
        v-if="!entries.length"
        class="flex h-full flex-col items-center justify-center gap-2 px-6 py-16 text-center"
      >
        <p class="text-sm font-medium">{{ emptyTitle }}</p>
        <p class="text-xs text-muted">{{ emptyDescription }}</p>
      </div>

      <div v-else class="py-2">
        <template v-for="group in groupedEntries" :key="group.key">
          <p class="px-4 py-3 text-center text-xs font-medium text-muted">{{ group.label }}</p>

          <template v-for="item in group.items" :key="item.entry.id">
            <!--
              Something that happened to the record, not something anyone said:
              every kind but `message`, which is the only one carrying a body.
              No fill and no pill — the absence of a bubble is what says this is
              not a person talking.
            -->
            <div
              v-if="item.entry.kind !== 'message'"
              class="flex items-center justify-center gap-2 px-4 py-3 text-center text-xs text-muted"
            >
              <UIcon :name="systemEventIcon(item.entry)" class="size-3.5 shrink-0" />
              <span>{{ systemEventLabel(item.entry) }}</span>
            </div>

            <!-- Guest and member messages. Delivery receipts sit with the message they
                 describe and stay visible: a failed send is the one thing an owner must
                 not have to hover to discover. -->
            <div
              v-else
              class="flex px-4 sm:px-6"
              :class="[
                item.entry.actorKind === 'member' ? 'justify-end' : 'justify-start',
                item.startsRun ? 'pt-2' : 'pt-0.5',
              ]"
            >
              <div class="flex max-w-[78%] items-end gap-2" :class="item.entry.actorKind === 'member' ? 'flex-row-reverse' : ''">
                <UAvatar
                  v-if="item.entry.actorKind !== 'member'"
                  :alt="actorLabel(item.entry)"
                  size="md"
                  class="mb-1 shrink-0"
                />

                <div class="min-w-0 space-y-1">
                  <!-- One meta line per run, not per message: a five-message burst
                       repeating the same name and minute is noise. -->
                  <div
                    v-if="item.startsRun"
                    class="flex flex-wrap items-center gap-2 pb-0.5 text-xs font-medium text-muted"
                    :class="item.entry.actorKind === 'member' ? 'justify-end' : ''"
                  >
                    <span class="text-highlighted">{{ actorLabel(item.entry) }}</span>
                    <span>{{ channelLabel(item.entry.channel) }}</span>
                    <span>{{ formatRelativeTime(item.entry.occurredAt) }}</span>
                  </div>

                  <div
                    class="rounded-2xl px-4 py-3 text-base leading-normal whitespace-pre-wrap"
                    :class="item.entry.actorKind === 'member'
                      ? 'rounded-br-[2px] bg-primary text-(--primary-foreground,#fff)'
                      : 'rounded-bl-[2px] bg-elevated text-default'"
                  >
                    {{ item.entry.body }}
                  </div>

                  <div
                    v-if="item.entry.deliveries.length"
                    class="flex flex-wrap items-center gap-x-3 gap-y-1"
                    :class="item.entry.actorKind === 'member' ? 'justify-end' : ''"
                  >
                    <span
                      v-for="delivery in item.entry.deliveries"
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
        </template>
      </div>
    </div>

    <div class="shrink-0 px-4 pb-4 pt-2 sm:px-6">
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

      <UChatPrompt
        v-model="draft"
        :placeholder="placeholder"
        :disabled="disabled"
        :rows="3"
        :maxrows="8"
        :ui="{ root: 'rounded-2xl' }"
        @submit="$emit('submit')"
      >
        <template #trailing>
          <UChatPromptSubmit
            status="ready"
            :loading="loading"
            color="primary"
            variant="solid"
            size="xs"
            aria-label="Send reply"
            title="Send reply"
            :disabled="disabled || loading || !draft.trim()"
          />
        </template>
      </UChatPrompt>

      <p v-if="disabledReason" class="mt-2 text-xs text-warning">{{ disabledReason }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
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
  guestName: string
  /** The tenant's word for the record behind this thread: reservation, experience, consultation. */
  recordNoun: string
  /** Where that record is read. Null for a thread that has none. */
  recordTo?: string | null
  /** What the guest wrote when they opened the thread, if anything. */
  openingMessage?: string | null
  subline?: string | null
  placeholder?: string
  loading?: boolean
  disabled?: boolean
  disabledReason?: string | null
  retryingDeliveryId?: string | null
  emptyTitle?: string
  emptyDescription?: string
}>(), {
  recordTo: null,
  openingMessage: null,
  subline: null,
  placeholder: 'Write your reply…',
  loading: false,
  disabled: false,
  disabledReason: null,
  retryingDeliveryId: null,
  emptyTitle: 'No messages yet',
  emptyDescription: 'Guest replies will appear here.',
  deliveryFailures: () => [],
})

defineEmits<{
  submit: []
  'retry-delivery': [deliveryId: string]
}>()

const { formatRelativeTime } = useHumanTime()

// A thread opens on its newest entry and follows new ones, the way an inbox
// should. This list is the surface's own, so it owns its own scrolling.
const scrollContainer = useTemplateRef<HTMLElement>('scrollContainer')

function scrollToLatestEntry(behavior: ScrollBehavior) {
  const container = scrollContainer.value
  if (!container) return
  container.scrollTo({ top: container.scrollHeight, behavior })
}

onMounted(() => scrollToLatestEntry('auto'))

watch(() => props.entries.length, async () => {
  await nextTick()
  const reducedMotion = import.meta.client && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  scrollToLatestEntry(reducedMotion ? 'auto' : 'smooth')
})

/**
 * The stream in the shape it reads in: one heading per day, and within a day a
 * run of consecutive messages from the same side carrying one meta line.
 */
const groupedEntries = computed(() => {
  const groups: Array<{ key: string; label: string; items: Array<{ entry: GuestThreadEntryMessage; startsRun: boolean }> }> = []
  let previousDay: string | null = null
  let previousRunKey: string | null = null

  for (const raw of props.entries) {
    // The submission IS the guest's first message when they wrote one. Airbnb
    // shows the opening words in the stream; ours only had them in the list
    // preview, so the conversation opened on "started this conversation" and
    // nothing the guest actually said.
    const entry = raw.kind === 'submission' && props.openingMessage
      ? { ...raw, kind: 'message' as const, actorKind: 'guest' as const, body: props.openingMessage }
      : raw
    const occurred = new Date(entry.occurredAt)
    const day = `${occurred.getFullYear()}-${occurred.getMonth()}-${occurred.getDate()}`
    if (day !== previousDay) {
      groups.push({ key: day, label: dayLabel(entry.occurredAt), items: [] })
      previousDay = day
      previousRunKey = null
    }
    const runKey = entry.kind === 'message' ? `${entry.actorKind}:${entry.actorLabel ?? ''}` : null
    const startsRun = runKey === null || runKey !== previousRunKey
    previousRunKey = runKey
    groups[groups.length - 1]!.items.push({ entry, startsRun })
  }

  return groups
})

function dayLabel(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const days = Math.round((Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    - Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Intl.DateTimeFormat('en', {
    weekday: days < 7 ? 'long' : undefined,
    month: days < 7 ? undefined : 'long',
    day: days < 7 ? undefined : 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date)
}

function actorLabel(entry: GuestThreadEntryMessage) {
  if (entry.actorKind === 'guest') return props.guestName
  if (entry.actorKind === 'member') return entry.actorLabel || 'Owner'
  return 'System'
}

function deliveryLabel(delivery: GuestThreadEntryDelivery) {
  const channel = delivery.channel === 'whatsapp' ? 'WhatsApp' : 'Email'
  return `${channel} ${DELIVERY_PURPOSE_LABELS[delivery.purpose]} · ${DELIVERY_STATUS_LABELS[delivery.status]}`
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

function systemEventIcon(entry: GuestThreadEntryMessage) {
  if (entry.kind === 'submission') return 'i-lucide-sparkles'
  if (entry.kind === 'resolution') {
    return entry.eventName === 'thread.resolved' ? 'i-lucide-check-check' : 'i-lucide-rotate-ccw'
  }
  return 'i-lucide-circle-check'
}

function systemEventLabel(entry: GuestThreadEntryMessage) {
  const payload = entry.payload ?? {}
  const actor = entry.actorLabel ? `${entry.actorLabel} ` : ''
  const noun = props.recordNoun.toLowerCase()

  if (entry.kind === 'submission') return `${props.guestName} started this conversation`

  if (entry.kind === 'operation') {
    const action = String(payload.action ?? '')
    if (entry.eventName === 'migration_snapshot') return 'Imported from previous system'
    if (action === 'confirm') return `${actor}confirmed the ${noun}`.trim()
    if (action === 'cancel') return `${actor}cancelled the ${noun}`.trim()
    if (action === 'complete') return `${actor}marked the ${noun} complete`.trim()
    return entry.eventName ?? 'Operation recorded'
  }

  // Threads are no longer resolved by hand, but the entries that were still
  // belong to the history of the ones that have them.
  if (entry.kind === 'resolution') {
    if (entry.eventName === 'thread.resolved') return `${actor}resolved this thread`.trim()
    return `${actor}reopened this thread`.trim()
  }

  return entry.eventName ?? 'Recorded on this conversation'
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
