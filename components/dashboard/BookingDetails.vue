<template>
  <!--
    One record, two places it is opened from: its own screen under Today, and
    the detail column of the guest thread it belongs to. Neither chrome belongs
    here — the route that mounted this drew it — so this is the record body and
    the editor chain that hangs off `basePath`.
  -->
  <div class="flex min-h-0 flex-1 flex-col">
      <div v-if="pending && !booking" class="space-y-4 p-5 sm:p-8">
        <USkeleton v-for="index in 4" :key="index" class="h-40 rounded-2xl" />
      </div>
      <div v-else-if="error" class="p-5 sm:p-8">
        <UAlert color="error" variant="soft" title="Booking details could not be loaded" :description="getErrorMessage(error, 'Booking request failed')" />
      </div>
      <EditorPaneShell
        v-else
        :has-detail="Boolean(detailTitle)"
        :detail-title="detailTitle"
        :dismiss-to="isChangeMode ? `${bookingPath}/change` : bookingPath"
        :show-actions="editorKey === 'notes' || Boolean(isChangeMode && editorField)"
        :saving="noteSaving || changeSaving"
        :save-label="isChangeMode && editorField ? 'Done' : undefined"
        :save-disabled="editorKey === 'notes' && (!noteDraft.trim() || noteDraft === selectedNote?.body)"
        :error="editorKey === 'notes' ? noteError : changeError"
        @cancel="cancelEditor"
        @save="commitEditor"
      >
        <template #index>
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
          <!--
            Change is a mode of this leaf, not a screen of its own: every row
            edits the same staged draft and nothing here persists until the one
            commit in the footer. That is why the field editors have no Save of
            their own — a per-field commit bar would promise a write that never
            happens.
          -->
          <div v-if="booking && isChangeMode" class="mx-auto w-full max-w-md">
            <h1 class="text-[32px] font-semibold leading-tight text-highlighted">What do you want to change?</h1>
            <p class="mt-2 text-base text-muted">
              {{ firstName(booking.guestName) }} confirms the change before anything moves.
            </p>

            <div class="mt-6 flex items-center gap-4 border-t border-default pt-6">
              <img v-if="changeLocation?.imageUrl" :src="changeLocation.imageUrl" alt="" class="size-14 shrink-0 rounded-xl object-cover">
              <p class="min-w-0 flex-1 text-base font-medium text-highlighted">{{ changeLocation?.title }}</p>
              <UButton
                v-if="props.bookingType === 'reservation'"
                :to="`${bookingPath}/change/location`"
                icon="i-lucide-pencil"
                aria-label="Change location"
                color="neutral"
                variant="soft"
                square
                class="shrink-0 rounded-full"
              />
            </div>

            <div class="mt-2 border-t border-default">
              <NuxtLink
                v-for="field in changeFields"
                :key="field.key"
                :to="`${bookingPath}/change/${field.key}`"
                class="flex items-center gap-4 border-b border-default py-4"
                :aria-label="`Change ${field.label.toLowerCase()}`"
              >
                <span class="min-w-0 flex-1">
                  <span class="block text-base font-medium text-highlighted">{{ field.label }}</span>
                  <span class="block text-sm text-muted">{{ field.summary }}</span>
                </span>
                <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
              </NuxtLink>
            </div>
          </div>
          <!--
            Measured on Airbnb's reservation panel, which has no cards at all:
            one picture, a 32px/600 title, full-width 48px actions at 12px
            radius, a two-column label grid, then 74px disclosure rows. The
            ringed rounded-2xl panels this replaces were ours, not theirs.
          -->
          <!--
            One measure wherever it is mounted. Airbnb's reservation panel is a
            375px column; letting this run to a full-width screen turned the
            picture into a billboard and pushed the actions below the fold.
          -->
          <template v-else-if="booking">
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
                :to="`${bookingPath}/change`"
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
              <NuxtLink :to="`${bookingPath}/guest`" class="flex items-center gap-4 py-4">
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

              <NuxtLink :to="`${bookingPath}/notes`" class="flex items-center gap-4 border-t border-default py-4">
                <span class="min-w-0 flex-1">
                  <span class="block text-base font-medium text-highlighted">Your notes</span>
                  <span class="block text-sm text-muted">{{ notesSummary }}</span>
                </span>
                <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-muted" />
              </NuxtLink>

              <div v-if="booking.notes.length" class="border-t border-default py-2">
                <NuxtLink
                  v-for="note in booking.notes"
                  :key="note.id"
                  :to="`${bookingPath}/notes/${note.id}`"
                  class="block py-2"
                  :aria-label="`Edit note: ${note.body}`"
                >
                  <span class="block whitespace-pre-wrap text-sm text-highlighted">{{ note.body }}</span>
                  <span class="block text-xs text-dimmed">{{ formatCreatedAt(note.createdAt) }}</span>
                </NuxtLink>
              </div>

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
        </template>

        <template v-if="booking && isChangeMode" #index-footer>
          <UButton label="Cancel" color="neutral" variant="ghost" :to="bookingPath" @click="resetChangeDraft" />
          <UButton label="Send request" :loading="changeSaving" :disabled="Boolean(editorField) || !changeValid || !changeDirty" @click="sendChangeRequest" />
        </template>

        <template #detail>
          <template v-if="booking">
            <div v-if="editorKey === 'notes'" class="mx-auto w-full max-w-md space-y-6">
              <p class="text-base text-muted">Only your team can see these notes.</p>
              <UFormField label="Note">
                <UTextarea v-model="noteDraft" :rows="10" maxlength="2000" autofocus class="w-full" placeholder="Add a note to yourself" />
              </UFormField>
            </div>
            <div v-else-if="isChangeMode" class="mx-auto w-full max-w-md space-y-6">
              <UFormField v-if="editorField === 'date'" label="Date">
                <UInput v-model="changeDraft.bookingDate" type="date" size="xl" autofocus class="w-full" />
              </UFormField>
              <UFormField v-else-if="editorField === 'time'" label="Time">
                <UInput v-model="changeDraft.bookingTime" type="time" size="xl" autofocus class="w-full" />
              </UFormField>
              <UFormField v-else-if="editorField === 'guests'" label="Guests">
                <UInputNumber v-model="changeDraft.partySize" :min="1" :max="99" size="xl" class="w-full" />
              </UFormField>
              <UFormField v-else-if="editorField === 'location'" label="Location">
                <USelect v-model="changeDraft.locationId" :items="booking.locations.map(location => ({ label: location.title, value: location.id }))" size="xl" class="w-full" />
              </UFormField>
              <p class="text-sm text-muted">Nothing is sent yet. Your guest sees every change at once when you send the request.</p>
            </div>
            <!--
              Read-only guest details are a description list, not a form. Wrapping
              them in UFormField emitted a <label> pointing at no control, which
              reads as an editable field that ignores you.
            -->
            <div v-else-if="editorKey === 'guest'" class="mx-auto w-full max-w-md space-y-6">
              <h3 class="text-[32px] font-semibold leading-tight text-highlighted">{{ booking.guestName }}</h3>
              <dl class="space-y-4">
                <div>
                  <dt class="text-sm text-muted">Email</dt>
                  <dd class="mt-1 break-words text-highlighted">{{ booking.guestEmail }}</dd>
                </div>
                <div v-if="booking.guestPhone">
                  <dt class="text-sm text-muted">Phone</dt>
                  <dd class="mt-1 text-highlighted">{{ booking.guestPhone }}</dd>
                </div>
              </dl>
              <div class="flex gap-3">
                <UButton :to="messageTo || undefined" label="Message" icon="i-lucide-message-circle" color="neutral" variant="soft" :disabled="!messageTo" />
                <UButton :to="callTo || undefined" label="Call" icon="i-lucide-phone" color="neutral" variant="soft" :disabled="!callTo" />
              </div>
            </div>
          </template>
        </template>
      </EditorPaneShell>
  </div>

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

<script setup lang="ts">
import { formatCalendarDate, formatTime, formatTimestamp } from '~/utils/timezone'
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import { getErrorMessage } from '~/utils/errors'
import type { DashboardBookingDetails, DashboardBookingType } from '~/server/utils/dashboard-booking-details'

const props = defineProps<{
  bookingType: DashboardBookingType
  bookingId: string
  /** Where this record lives in the URL. Its editor chain hangs off it. */
  basePath: string
}>()

type ActionColor = 'success' | 'error' | 'neutral'

const router = useRouter()
const dashboardApi = useDashboardApi()
const realtime = useDashboardInvalidations()
const actionError = ref<string | null>(null)
const bookingPath = computed(() => props.basePath)
// `useEditorFrame` provides and injects, so it runs before any `await`, and it
// owns the split of the route below this booking. The `route.params.editor`
// derivation this replaces was a second copy of the composable's `rest`.
const frame = useEditorFrame(bookingPath)
const editorSegments = frame.rest
const editorKey = computed(() => editorSegments.value[0] || '')
const editorField = computed(() => editorSegments.value[1] || '')
const isChangeMode = computed(() => editorKey.value === 'change')
const selectedNote = computed(() => booking.value?.notes.find(note => note.id === editorField.value))
const detailTitle = computed(() => editorKey.value === 'notes' ? editorField.value ? 'Edit note' : 'Add a note' : editorKey.value === 'guest' ? 'Guest details' : isChangeMode.value && editorField.value ? `Change ${editorField.value}` : undefined)

const { resource, booking, pending, error, presentation, noun, orgSlug, refresh: refreshDetails } = await useBookingDetails(props.bookingType, props.bookingId)
const detailsKey = computed(() => `dashboard-booking:${orgSlug.value}:${props.bookingType}:${props.bookingId}`)
watchEffect(() => {
  const valid = editorSegments.value.length <= 2 && (!editorKey.value
    || (editorKey.value === 'guest' && !editorField.value)
    || (editorKey.value === 'notes' && (!editorField.value || Boolean(selectedNote.value)))
    || (isChangeMode.value && (!editorField.value || ['date', 'time', 'guests', 'location'].includes(editorField.value))))
  if (!valid && booking.value) throw createError({ statusCode: 404, statusMessage: 'Editor not found' })
})

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

watch([detailsKey, () => selectedNote.value?.id, editorKey, editorField], () => {
  noteDraft.value = selectedNote.value?.body ?? ''
  noteRevisionId.value = selectedNote.value?.revisionId
  noteAttemptKey.value = null
  noteAttemptDraft.value = null
}, { immediate: true })

watch([booking, editorKey, editorField], ([currentBooking, key], previous) => {
  // A field leaf is a route, so Nuxt may recreate this component while moving
  // between it and the change hub. Keep the one staged draft in Nuxt state and
  // only reseed it when it belongs to an older source revision, or when change
  // mode is being entered afresh and the tenant should not inherit the edits
  // they abandoned last time.
  const entering = key === 'change' && previous !== undefined && previous[1] !== 'change'
  if (currentBooking && key === 'change' && (entering || changeDraft.value.sourceUpdatedAt !== currentBooking.updatedAt)) resetChangeDraft()
  if (key === 'change' && isChangeField(editorField.value)) changeFieldOriginal.value = changeDraft.value[draftKey(editorField.value)]
}, { immediate: true })

function isChangeField(value: string): value is 'date' | 'time' | 'guests' | 'location' {
  return ['date', 'time', 'guests', 'location'].includes(value)
}

function draftKey(field: 'date' | 'time' | 'guests' | 'location') {
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

function closeEditor() {
  return router.push(isChangeMode.value && editorField.value ? `${bookingPath.value}/change` : bookingPath.value)
}

function cancelEditor() {
  noteError.value = null
  changeError.value = null
  if (isChangeMode.value && isChangeField(editorField.value) && changeFieldOriginal.value !== null) {
    const key = draftKey(editorField.value)
    if (key === 'partySize') changeDraft.value.partySize = Number(changeFieldOriginal.value)
    else changeDraft.value[key] = String(changeFieldOriginal.value)
  }
  return closeEditor()
}

function commitEditor() {
  return isChangeMode.value && editorField.value ? closeEditor() : saveNote()
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
  if (!noteDraft.value.trim()) return
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
    await closeEditor()
  } catch (cause) {
    noteError.value = getErrorMessage(cause, 'Note could not be saved')
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
    await closeEditor()
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
</script>
