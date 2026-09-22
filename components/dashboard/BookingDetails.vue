<template>
  <!--
    One record, two places it is opened from: its own screen under Today, and
    the detail column of the guest thread it belongs to. This is the summary;
    the things that change it — the request, a note, the guest — are levels of
    their own under the record's canonical URL, which both mounts link to.
  -->
  <!--
    The provider owns its chrome: the levels below inject what this component
    holds, and `<NuxtPage>` reaches them only from inside its own subtree. In
    the thread's drawer there is no column to own, so it is the body alone.
  -->
  <component :is="embedded ? 'div' : DashboardIndexPanel" v-bind="chrome">
    <div v-if="pending && !booking" class="space-y-4 p-5 sm:p-8">
      <USkeleton v-for="index in 4" :key="index" class="h-40 rounded-2xl" />
    </div>
    <div v-else-if="error" class="p-5 sm:p-8">
      <UAlert color="error" variant="soft" title="Booking details could not be loaded" :description="getErrorMessage(error, 'Booking request failed')" />
    </div>
    <template v-else>
      <div class="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
        <UAlert
          v-if="actionError"
          class="mb-5"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="actionError"
        />
        <UAlert
          v-if="realtime.status.value === 'failed'"
          class="mb-5"
          color="warning"
          variant="soft"
          icon="i-lucide-wifi-off"
          title="Reservation details may be out of date"
          description="The live dashboard connection is unavailable."
        >
          <template #actions>
            <UButton color="warning" variant="soft" size="xs" @click="retryRealtime">Refresh</UButton>
          </template>
        </UAlert>
        <template v-if="booking">
          <div class="mx-auto w-full max-w-md">
          <img
            v-if="bookingImageUrl"
            :src="bookingImageUrl"
            alt=""
            class="mb-6 aspect-[4/3] w-full rounded-xl object-cover"
          >

          <h1 class="text-[32px] font-semibold leading-tight text-highlighted">{{ partyTitle }}</h1>
          <p class="mt-1 text-base text-muted">{{ formattedDate }} <span aria-hidden="true">·</span> {{ booking.resourceTitle }}</p>

          <div class="mt-6 space-y-2">
            <UButton
              :label="`Change ${noun}`"
              color="neutral"
              variant="soft"
              block
              class="h-12 justify-center rounded-xl text-base font-medium"
              :to="`${editorPath}/change`"
              @click="beginChange"
            />
            <UButton
              v-if="messageTo"
              label="Message guest"
              color="neutral"
              variant="soft"
              block
              class="h-12 justify-center rounded-xl text-base font-medium"
              :to="messageTo"
            />
          </div>

          <div class="mt-8 grid grid-cols-2 gap-4 border-t border-default pt-6">
            <div>
              <p class="text-base font-semibold text-highlighted">Date</p>
              <p class="mt-1 text-base text-muted">{{ formattedDate }}</p>
            </div>
            <div>
              <p class="text-base font-semibold text-highlighted">Time</p>
              <p class="mt-1 text-base text-muted">{{ formattedTime }}</p>
            </div>
          </div>

          <div class="mt-6 border-t border-default pt-2">
            <NuxtLink :to="`${editorPath}/guest`" class="flex items-center gap-4 py-4">
              <UAvatar :src="booking.guestImageUrl || undefined" :alt="booking.guestName" size="md" class="shrink-0" />
              <span class="min-w-0 flex-1">
                <span class="block text-base font-medium text-highlighted">{{ booking.guestName }}</span>
                <span class="block text-sm text-muted">{{ guestCountLabel }}</span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
            </NuxtLink>

            <div v-if="booking.requests" class="border-t border-default py-4">
              <p class="text-base font-medium text-highlighted">Guest requests</p>
              <p class="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">{{ booking.requests }}</p>
            </div>

            <button type="button" class="flex w-full items-center gap-4 border-t border-default py-4 text-left" @click="policyOpen = true">
              <span class="min-w-0 flex-1">
                <span class="block text-base font-medium text-highlighted">Cancellation policy</span>
                <span class="block text-sm text-muted">{{ cancellationSummary }}</span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
            </button>

            <NuxtLink :to="`${editorPath}/notes`" class="flex items-center gap-4 border-t border-default py-4">
              <span class="min-w-0 flex-1">
                <span class="block text-base font-medium text-highlighted">Your notes</span>
                <span class="block text-sm text-muted">{{ notesSummary }}</span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
            </NuxtLink>


            <div class="flex items-center gap-4 border-t border-default py-4">
              <span class="min-w-0 flex-1">
                <span class="block text-base font-medium text-highlighted">{{ capitalize(noun) }} made</span>
                <span class="block text-sm text-muted">{{ formatCreatedAt(booking.createdAt) }}</span>
              </span>
            </div>

            <div v-if="availableActions.length" class="border-t border-default pt-4">
              <UButton
                v-for="action in availableActions"
                :key="action.value"
                :label="action.label"
                :color="action.color"
                variant="ghost"
                block
                class="h-12 justify-start rounded-xl text-base font-medium"
                :loading="pendingAction === action.value"
                @click="action.value === 'cancel' ? openCancel() : runAction(action.value)"
              />
            </div>
          </div>
          </div>
        </template>
      </div>
    </template>
  </component>

  <DashboardListItemDialog v-model:open="policyOpen" :title="booking?.policy?.heading || 'Cancellation policy'" :show-actions="false">
    <div v-if="booking" class="space-y-4">
      <div v-if="booking.policy?.items.length" class="space-y-3">
        <div v-for="item in booking.policy!.items" :key="item.id" class="flex gap-3">
          <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-success" />
          <p class="text-sm leading-relaxed text-muted">{{ item.text }}</p>
        </div>
      </div>
      <p v-else class="text-sm text-muted">No cancellation terms have been configured for this booking.</p>
      <div v-if="booking.policy?.additional_notes_html" class="border-t border-default pt-4 text-sm text-muted">
        <!-- Canonical booking-policy writes sanitize this CMS-authored HTML before persistence. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-html="booking.policy!.additional_notes_html" />
      </div>
    </div>
  </DashboardListItemDialog>
  <!--
    Cancelling gets a screen that states the consequence and lets the tenant say
    why, rather than a native confirm() stacked on top of the sheet that opened
    it. The note travels with the notification the guest receives.
  -->
  <DashboardListItemDialog
    v-model:open="cancelOpen"
    :title="`Cancel ${noun}`"
    :show-actions="false"
    :error="actionError"
  >
    <div v-if="booking" class="space-y-5">
      <p class="text-sm leading-relaxed text-muted">{{ cancellationSummary }}</p>
      <UFormField :label="`Add a note for ${firstName(booking.guestName)}`" hint="Optional">
        <UTextarea v-model="cancelNote" :rows="4" maxlength="500" class="w-full" placeholder="Let them know why, and what happens next." />
      </UFormField>
      <p class="text-sm text-muted">
        {{ firstName(booking.guestName) }} is told the {{ noun }} was cancelled{{ cancelNote.trim() ? ', with your note' : '' }}. This cannot be undone.
      </p>
      <div class="flex items-center justify-between gap-4 pt-1">
        <UButton :label="`Keep ${noun}`" color="neutral" variant="ghost" @click="cancelOpen = false" />
        <UButton :label="`Cancel ${noun}`" color="error" :loading="pendingAction === 'cancel'" @click="runAction('cancel')" />
      </div>
    </div>
  </DashboardListItemDialog>
</template>

<script lang="ts">
import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { DashboardBookingDetails, DashboardBookingType } from '~/server/utils/dashboard-booking-details'

export interface BookingChangeDraft { bookingDate: string; bookingTime: string; partySize: number; locationId: string; sourceUpdatedAt: string }
export type BookingChangeField = 'date' | 'time' | 'guests' | 'location'

/** The record and the drafts its levels edit: one change request, one note. */
export interface BookingEditor {
  bookingType: DashboardBookingType
  booking: Ref<DashboardBookingDetails | null>
  noun: ComputedRef<string>
  messageTo: ComputedRef<string | null>
  callTo: ComputedRef<string | null>
  // the change request
  changeDraft: Ref<BookingChangeDraft>
  changeFields: ComputedRef<Array<{ key: string; label: string; summary: string }>>
  changeLocation: ComputedRef<{ title: string; imageUrl?: string | null } | undefined>
  changeDirty: ComputedRef<boolean>
  changeValid: ComputedRef<boolean>
  changeSaving: Ref<boolean>
  changeError: Ref<string | null>
  resetChangeDraft: () => void
  /** Remembers the field's value so a cancelled field leaf can put it back. */
  beginChangeField: (field: BookingChangeField) => void
  cancelChangeField: (field: BookingChangeField) => void
  sendChangeRequest: () => Promise<void>
  firstName: (name: string) => string
  // notes
  noteDraft: Ref<string>
  noteSaving: Ref<boolean>
  noteError: Ref<string | null>
  selectedNote: ComputedRef<{ id: string; body: string } | undefined>
  /** Points the note draft at one note, or at a new one. */
  openNote: (noteId: string | null) => void
  saveNote: () => Promise<boolean>
  formatCreatedAt: (value: string) => string
}

export const bookingEditorKey = Symbol('booking-editor') as InjectionKey<BookingEditor>
</script>

<script setup lang="ts">
import { formatCalendarDate, formatTime, formatTimestamp } from '~/utils/timezone'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
import DashboardIndexPanel from '~/lib/components/workspace/dashboard/DashboardIndexPanel.vue'
import { getErrorMessage } from '~/utils/errors'

const props = defineProps<{
  bookingType: DashboardBookingType
  bookingId: string
  /** The record's canonical URL, which the rows that change it link into. */
  editorPath: string
  /** Mounted inside the guest thread's drawer, which already owns the column. */
  embedded?: boolean
}>()

type ActionColor = 'success' | 'error' | 'neutral'

const dashboardApi = useDashboardApi()
const realtime = useDashboardInvalidations()
const actionError = ref<string | null>(null)
const editorPath = computed(() => props.editorPath)
// Owning the column means owning its header; inside the drawer it is a plain body.
const chrome = computed(() => (props.embedded
  ? { class: 'flex min-h-0 flex-1 flex-col' }
  : { id: 'booking-details', title: pageTitle.value, ui: { body: 'p-0 sm:p-0' } }))
/** Which note a leaf is editing, or none for a new one. */
const openNoteId = ref<string | null>(null)
const selectedNote = computed(() => booking.value?.notes.find(note => note.id === openNoteId.value))

const { resource, booking, pending, error, presentation, noun, pageTitle, orgSlug, refresh: refreshDetails } = await useBookingDetails(props.bookingType, props.bookingId)

const formattedDate = computed(() => booking.value ? formatCalendarDate(booking.value.bookingDate, 'en') : '')
const formattedTime = computed(() => {
  if (!booking.value) return ''
  return formatTime(booking.value.bookingTime, 'en')
})
// The picture the panel leads with: the hero of the location this was booked at.
const bookingImageUrl = computed(() => booking.value
  ? booking.value.locations.find(location => location.id === booking.value!.locationId)?.imageUrl ?? null
  : null)
// Airbnb's host-side stay page titles the party, not the listing: "Chris's
// group of 2". A single guest is just their name.
const partyTitle = computed(() => {
  if (!booking.value) return ''
  const size = booking.value.partySize
  return size > 1 ? `${booking.value.guestName}'s group of ${size}` : booking.value.guestName
})
const notesSummary = computed(() => {
  const count = booking.value?.notes.length ?? 0
  if (count === 0) return 'Only your team can see these notes'
  return count === 1 ? '1 note' : `${count} notes`
})

const guestCountLabel = computed(() => `${booking.value?.partySize ?? 0} ${(booking.value?.partySize ?? 0) === 1 ? 'guest' : 'guests'}`)
const cancellationSummary = computed(() => booking.value?.policy?.items.find(item => item.id === 'cancellation')?.text
  ?? 'No cancellation terms have been configured.')
const messageTo = computed(() => {
  if (!booking.value?.threadId) return null
  return `/dashboard/${orgSlug.value}/sites/${booking.value.siteSlug}/locations/${booking.value.locationSlug}/messages/${booking.value.threadId}`
})
const callTo = computed(() => booking.value?.guestPhone ? `tel:${booking.value.guestPhone}` : null)

const policyOpen = ref(false)
const cancelOpen = ref(false)
const cancelNote = ref('')
const changeSaving = ref(false)
const changeDraft = useState(
  `booking-change-draft:${orgSlug.value}:${props.bookingType}:${props.bookingId}`,
  () => ({ bookingDate: '', bookingTime: '', partySize: 1, locationId: '', sourceUpdatedAt: '' }),
)
const changeAttemptKey = ref<string | null>(null)
const changeAttemptDraft = ref('')
const changeFieldOriginal = ref<string | number | null>(null)
const changeLocation = computed(() => booking.value?.locations.find(location => location.id === changeDraft.value.locationId))
const changeDirty = computed(() => {
  if (!booking.value) return false
  if (changeDraft.value.partySize !== booking.value.partySize) return true
  // Only the fields this kind can actually change count as a change.
  return props.bookingType === 'reservation' && (
    changeDraft.value.bookingDate !== booking.value.bookingDate
    || changeDraft.value.bookingTime !== booking.value.bookingTime.slice(0, 5)
    || changeDraft.value.locationId !== booking.value.locationId)
})
/**
 * What this record can be changed to.
 *
 * A reservation moves to a location, date and time. A booking moves to another
 * SESSION of its product — an occurrence that exists as a row — so a date and
 * time picker cannot express one, and the screen offers party size only until
 * it can name a session.
 */
const changeFields = computed(() => props.bookingType === 'reservation'
  ? [
      { key: 'date', label: 'Date', summary: changeDraft.value.bookingDate ? formatCalendarDate(changeDraft.value.bookingDate, 'en') : 'Choose a date' },
      { key: 'time', label: 'Time', summary: changeDraft.value.bookingTime ? formatTime(changeDraft.value.bookingTime, 'en') : 'Choose a time' },
      { key: 'guests', label: 'Guests', summary: `${changeDraft.value.partySize} ${changeDraft.value.partySize === 1 ? 'guest' : 'guests'}` },
    ]
  : [
      { key: 'guests', label: 'Guests', summary: `${changeDraft.value.partySize} ${changeDraft.value.partySize === 1 ? 'guest' : 'guests'}` },
    ])
const changeValid = computed(() => props.bookingType === 'reservation'
  ? Boolean(changeDraft.value.bookingDate && changeDraft.value.bookingTime && changeDraft.value.locationId && Number.isInteger(changeDraft.value.partySize) && changeDraft.value.partySize > 0)
  : Boolean(booking.value?.sessionId && Number.isInteger(changeDraft.value.partySize) && changeDraft.value.partySize > 0))
const pendingAction = ref<string | null>(null)
const actionAttempt = ref<{ draft: string; key: string } | null>(null)
const noteDraft = ref('')
const noteRevisionId = ref<string>()
const noteSaving = ref(false)
const noteAttemptKey = ref<string | null>(null)
const noteAttemptDraft = ref<string | null>(null)
const noteError = ref<string | null>(null)
const changeError = ref<string | null>(null)

function openNote(noteId: string | null) {
  openNoteId.value = noteId
  noteDraft.value = selectedNote.value?.body ?? ''
  noteRevisionId.value = selectedNote.value?.revisionId
  noteAttemptKey.value = null
  noteAttemptDraft.value = null
  noteError.value = null
}

// The staged change lives in Nuxt state so the change index and its field leaves,
// each a route of its own, edit one draft. It is reseeded only when it belongs
// to an older source revision.
watch(booking, (currentBooking) => {
  if (currentBooking && changeDraft.value.sourceUpdatedAt !== currentBooking.updatedAt) resetChangeDraft()
}, { immediate: true })

function beginChangeField(field: BookingChangeField) {
  changeFieldOriginal.value = changeDraft.value[draftKey(field)]
}

function cancelChangeField(field: BookingChangeField) {
  changeError.value = null
  if (changeFieldOriginal.value === null) return
  const key = draftKey(field)
  if (key === 'partySize') changeDraft.value.partySize = Number(changeFieldOriginal.value)
  else changeDraft.value[key] = String(changeFieldOriginal.value)
}

function draftKey(field: BookingChangeField) {
  return field === 'date' ? 'bookingDate' : field === 'time' ? 'bookingTime' : field === 'guests' ? 'partySize' : 'locationId'
}

function resetChangeDraft() {
  if (!booking.value) return
  changeDraft.value.bookingDate = booking.value.bookingDate
  changeDraft.value.bookingTime = booking.value.bookingTime.slice(0, 5)
  changeDraft.value.partySize = booking.value.partySize
  changeDraft.value.locationId = booking.value.locationId
  changeDraft.value.sourceUpdatedAt = booking.value.updatedAt
  changeAttemptKey.value = null
  changeAttemptDraft.value = ''
}

function beginChange() {
  resetChangeDraft()
}

// Nothing to approve and nothing to mark done: a booking arrives confirmed and
// is complete once its end passes. Cancelling is the one thing left to decide,
// and changing it is the link above.
const availableActions = computed<Array<{ value: string; label: string; icon: string; color: ActionColor }>>(() => {
  if (!booking.value || !presentation.value || !booking.value.threadId) return []
  if (booking.value.status !== 'confirmed' || booking.value.complete) return []
  return [{ value: 'cancel', label: `Cancel ${presentation.value.noun}`, icon: 'i-lucide-calendar-x', color: 'error' as const }]
})

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
}

function formatCreatedAt(value: string) {
  return formatTimestamp(value, 'en', 'UTC', { dateStyle: 'medium' })
}


function openCancel() {
  cancelNote.value = ''
  actionError.value = null
  cancelOpen.value = true
}

function retryRealtime() {
  realtime.connect()
  void refreshDetails()
}

watch(realtime.event, (event) => {
  if (!event || (event.type !== 'thread.changed' && event.type !== 'delivery.changed')) return
  if (event.threadId === booking.value?.threadId) void refreshDetails()
})
watch(realtime.connectionEpoch, (epoch) => {
  if (epoch > 0) void refreshDetails()
})

async function saveNote() {
  if (!noteDraft.value.trim()) return false
  if (noteAttemptDraft.value !== noteDraft.value) {
    noteAttemptKey.value = crypto.randomUUID()
    noteAttemptDraft.value = noteDraft.value
  }
  noteSaving.value = true
  noteError.value = null
  try {
    const response = await dashboardApi<{ booking: DashboardBookingDetails }>(
      `/api/dashboard/bookings/${props.bookingType}/${encodeURIComponent(props.bookingId)}/notes`,
      {
        method: 'POST',
        body: { note: noteDraft.value, idempotencyKey: noteAttemptKey.value, noteId: selectedNote.value?.id, revisionId: noteRevisionId.value },
        validate: isBookingDetailsResponse,
      },
    )
    resource.value = response
    return true
  } catch (cause) {
    noteError.value = getErrorMessage(cause, 'Note could not be saved')
    return false
  } finally {
    noteSaving.value = false
  }
}

async function sendChangeRequest() {
  if (!changeValid.value || !changeDirty.value) return
  const draft = JSON.stringify(changeDraft.value)
  if (!changeAttemptKey.value || changeAttemptDraft.value !== draft) {
    changeAttemptKey.value = crypto.randomUUID()
    changeAttemptDraft.value = draft
  }
  changeSaving.value = true
  changeError.value = null
  try {
    // The writer takes one shape per kind and refuses anything else, so the
    // screen says which it is sending rather than posting a reservation-shaped
    // body for both — which is how every change request came back a 400.
    const proposal = props.bookingType === 'reservation'
      ? {
          kind: 'reservation' as const,
          bookingDate: changeDraft.value.bookingDate,
          bookingTime: changeDraft.value.bookingTime,
          partySize: changeDraft.value.partySize,
          locationId: changeDraft.value.locationId,
        }
      : { kind: 'booking' as const, sessionId: booking.value?.sessionId ?? '', partySize: changeDraft.value.partySize }
    const response = await dashboardApi<{ booking: DashboardBookingDetails }>(
      `/api/dashboard/bookings/${props.bookingType}/${encodeURIComponent(props.bookingId)}/changes`,
      {
        method: 'POST',
        body: { ...proposal, expectedUpdatedAt: booking.value?.updatedAt, idempotencyKey: changeAttemptKey.value },
        validate: isBookingDetailsResponse,
      },
    )
    resource.value = response
    resetChangeDraft()
    await navigateTo(editorPath.value)
  } catch (cause) {
    changeError.value = getErrorMessage(cause, 'Change request could not be sent')
  } finally {
    changeSaving.value = false
  }
}

async function runAction(action: string) {
  if (!booking.value?.threadId || pendingAction.value) return
  const note = action === 'cancel' ? cancelNote.value.trim() : ''
  const draft = JSON.stringify([booking.value.threadId, action, note])
  if (actionAttempt.value?.draft !== draft) actionAttempt.value = { draft, key: crypto.randomUUID() }
  pendingAction.value = action
  actionError.value = null
  try {
    await dashboardApi(`/api/dashboard/sites/${booking.value.siteId}/guest-threads/${booking.value.threadId}/operations/${action}`, {
      method: 'POST',
      body: { idempotencyKey: actionAttempt.value.key, ...(note ? { body: note } : {}) },
      validate: (value: unknown): value is { thread: Record<string, unknown> } => isRecord(value) && isRecord(value.thread),
    })
    await refreshDetails()
    actionAttempt.value = null
    cancelOpen.value = false
  } catch (cause) {
    actionError.value = getErrorMessage(cause, 'Booking could not be updated')
  } finally {
    pendingAction.value = null
  }
}
provide(bookingEditorKey, {
  bookingType: props.bookingType,
  booking,
  noun,
  messageTo,
  callTo,
  changeDraft,
  changeFields,
  changeLocation,
  changeDirty,
  changeValid,
  changeSaving,
  changeError,
  resetChangeDraft,
  beginChangeField,
  cancelChangeField,
  sendChangeRequest,
  firstName,
  noteDraft,
  noteSaving,
  noteError,
  selectedNote,
  openNote,
  saveNote,
  formatCreatedAt,
})
</script>
