<template>
  <UDashboardPanel id="booking-details" :ui="{ body: 'min-h-0 gap-0! overflow-hidden! p-0! sm:p-0!' }">
    <template #header>
      <UDashboardNavbar :title="isChangeMode && noun ? `Change ${noun}` : pageTitle" :toggle="false">
        <template #leading>
          <DashboardNavbarLeading :to="isChangeMode ? bookingPath : todayPath" :label="isChangeMode && noun ? capitalize(noun) : 'Today'" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
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
        :saving="noteSaving"
        :save-label="isChangeMode && editorField ? 'Done' : undefined"
        :save-disabled="editorKey === 'notes' && (!noteDraft.trim() || noteDraft === selectedNote?.body)"
        @cancel="cancelEditor"
        @save="commitEditor"
      >
        <template #index>
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
          <div v-if="booking && isChangeMode" class="space-y-8">
            <header>
              <h1 class="text-2xl font-semibold text-highlighted">What do you want to change?</h1>
              <p class="mt-4 text-base text-muted">After making your desired changes, you can send a request to your guest, {{ firstName(booking.guestName) }}, to confirm the alterations to your {{ noun }}.</p>
            </header>
            <UCard variant="subtle" class="rounded-2xl">
              <div class="flex items-center gap-4">
                <img v-if="changeLocation?.imageUrl" :src="changeLocation.imageUrl" alt="" class="size-16 rounded-xl object-cover">
                <p class="min-w-0 flex-1 font-semibold text-highlighted">{{ changeLocation?.title }}</p>
                <UButton :to="`${bookingPath}/change/location`" icon="i-lucide-pencil" aria-label="Change location" color="neutral" variant="soft" square />
              </div>
            </UCard>
            <section>
              <h2 class="text-xl font-semibold text-highlighted">{{ capitalize(noun) }} details</h2>
              <div v-for="field in changeFields" :key="field.key" class="flex items-center justify-between gap-4 border-b border-default py-6">
                <div class="min-w-0">
                  <h3 class="font-semibold text-highlighted">{{ field.label }}</h3>
                  <p class="mt-1 text-base text-muted">{{ field.summary }}</p>
                </div>
                <UButton :to="`${bookingPath}/change/${field.key}`" label="Change" :aria-label="`Change ${field.label.toLowerCase()}`" color="neutral" variant="soft" />
              </div>
            </section>
          </div>
          <template v-else-if="booking">
            <section class="mb-6 flex flex-col items-center text-center">
              <UAvatar
                :src="booking.guestImageUrl || undefined"
                :alt="booking.guestName"
                class="size-20"
                :ui="{ icon: 'size-10' }"
              />
              <h1 class="mt-5 text-2xl font-semibold text-highlighted">{{ booking.guestName }}</h1>
              <p class="mt-2 text-base text-muted">
                {{ formattedDate }} <span aria-hidden="true">·</span> {{ guestCountLabel }}
              </p>
              <p class="mt-1 text-base text-muted">{{ booking.resourceTitle }}</p>
            </section>

            <div class="space-y-4">
              <UCard variant="subtle" class="rounded-2xl">
                <div class="grid grid-cols-2 divide-x divide-default">
                  <div class="pr-5">
                    <p class="font-semibold text-highlighted">Date</p>
                    <p class="mt-1 text-sm text-muted">{{ formattedDate }}</p>
                  </div>
                  <div class="pl-5 text-right">
                    <p class="font-semibold text-highlighted">Time</p>
                    <p class="mt-1 text-sm text-muted">{{ formattedTime }}</p>
                  </div>
                </div>
                <div class="mt-6 flex items-center gap-4 border-t border-default pt-5">
                  <div class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <UIcon name="i-lucide-calendar-check" class="size-5 text-muted" />
                  </div>
                  <div class="min-w-0">
                    <p class="font-medium text-highlighted">{{ statusLabel }}</p>
                  </div>
                </div>
              </UCard>

              <UCard variant="subtle" class="rounded-2xl">
                <h2 class="font-semibold text-highlighted">Your notes</h2>
                <p class="mt-1 text-sm text-muted">Only your team can see these notes.</p>
                <div v-if="booking.notes.length" class="mt-4 divide-y divide-default">
                  <NuxtLink v-for="note in booking.notes" :key="note.id" :to="`${bookingPath}/notes/${note.id}`" class="block py-3" :aria-label="`Edit note: ${note.body}`">
                    <p class="whitespace-pre-wrap text-sm text-highlighted">{{ note.body }}</p>
                    <p class="mt-1 text-xs text-dimmed">{{ formatCreatedAt(note.createdAt) }}</p>
                  </NuxtLink>
                </div>
                <!--
                  A row that reads like the field it opens. The heading-plus-icon
                  it replaced put the only affordance in a corner, which is a
                  small target and a weak invitation for the empty state.
                -->
                <NuxtLink :to="`${bookingPath}/notes`" class="mt-4 flex items-center gap-3 py-1 text-muted hover:text-highlighted">
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-elevated">
                    <UIcon name="i-lucide-plus" class="size-4" />
                  </span>
                  <span class="text-sm">Add a note to yourself</span>
                </NuxtLink>
              </UCard>

              <UCard variant="subtle" class="rounded-2xl">
                <h2 class="font-semibold text-highlighted">Guests</h2>
                <NuxtLink :to="`${bookingPath}/guest`" class="mt-5 flex items-center gap-4">
                  <UAvatar :src="booking.guestImageUrl || undefined" alt="" size="3xl" />
                  <div class="min-w-0">
                    <p class="font-medium text-highlighted">{{ booking.guestName }}</p>
                    <p v-if="booking.partySize > 1" class="mt-0.5 text-sm text-muted">Plus {{ booking.partySize - 1 }} more</p>
                  </div>
                  <UIcon name="i-lucide-chevron-right" class="ml-auto size-5 shrink-0 text-muted" />
                </NuxtLink>
                <div v-if="booking.requests" class="mt-5 border-t border-default pt-5">
                  <h3 class="font-semibold text-highlighted">Guest requests</h3>
                  <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{{ booking.requests }}</p>
                </div>
              </UCard>

              <UButton color="neutral" variant="subtle" block class="justify-start text-left" trailing-icon="i-lucide-chevron-right" :ui="{ trailingIcon: 'ms-auto shrink-0' }" @click="policyOpen = true">
                <span class="min-w-0 py-2">
                  <span class="block font-semibold">Cancellation policy</span>
                  <span class="mt-1 block text-sm font-normal text-muted">{{ cancellationSummary }}</span>
                </span>
              </UButton>

              <UButton :label="`Manage ${noun}`" icon="i-lucide-pencil" trailing-icon="i-lucide-chevron-right" color="neutral" variant="subtle" size="lg" block class="justify-start" :ui="{ trailingIcon: 'ms-auto' }" @click="manageOpen = true" />

              <UCard variant="subtle" class="rounded-2xl">
                <div class="flex items-start gap-4">
                  <UIcon name="i-lucide-calendar-days" class="mt-0.5 size-5 shrink-0 text-muted" />
                  <div>
                    <p class="font-medium text-highlighted">{{ capitalize(noun) }} made</p>
                    <p class="mt-1 text-sm text-muted">{{ formatCreatedAt(booking.createdAt) }}</p>
                  </div>
                </div>
              </UCard>
            </div>
          </template>
        </template>

        <template v-if="booking" #index-footer>
          <!--
            Contacting the guest is the most common thing to do from this screen,
            so it stays reachable instead of scrolling away with the header.
            In change mode the same bar carries that mode's single commit.
          -->
          <template v-if="isChangeMode">
            <UButton label="Cancel" color="neutral" variant="ghost" :to="bookingPath" @click="resetChangeDraft" />
            <UButton label="Send request" :loading="changeSaving" :disabled="Boolean(editorField) || !changeValid || !changeDirty" @click="sendChangeRequest" />
          </template>
          <div v-else class="flex flex-1 items-center justify-center gap-3">
            <UButton :to="messageTo || undefined" label="Message" icon="i-lucide-message-circle" color="neutral" variant="soft" :disabled="!messageTo" />
            <UButton :to="callTo || undefined" label="Call" icon="i-lucide-phone" color="neutral" variant="soft" :disabled="!callTo" />
          </div>
        </template>

        <template #detail>
          <template v-if="booking">
            <div v-if="editorKey === 'notes'" class="space-y-6">
              <p class="text-base text-muted">Only your team can see these notes.</p>
              <UFormField label="Note">
                <UTextarea v-model="noteDraft" :rows="10" maxlength="2000" autofocus class="w-full" placeholder="Add a note to yourself" />
              </UFormField>
            </div>
            <div v-else-if="isChangeMode" class="space-y-6">
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
            <div v-else-if="editorKey === 'guest'" class="space-y-6">
              <h3 class="text-xl font-semibold text-highlighted">{{ booking.guestName }}</h3>
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
    </template>
  </UDashboardPanel>

  <DashboardListItemDialog v-model:open="policyOpen" :title="booking?.policy.heading || 'Cancellation policy'" :show-actions="false">
    <div v-if="booking" class="space-y-4">
      <div v-if="booking.policy.items.length" class="space-y-3">
        <div v-for="item in booking.policy.items" :key="item.id" class="flex gap-3">
          <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-success" />
          <p class="text-sm leading-relaxed text-muted">{{ item.text }}</p>
        </div>
      </div>
      <p v-else class="text-sm text-muted">No cancellation terms have been configured for this booking.</p>
      <div v-if="booking.policy.additional_notes_html" class="border-t border-default pt-4 text-sm text-muted">
        <!-- Canonical booking-policy writes sanitize this CMS-authored HTML before persistence. -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-html="booking.policy.additional_notes_html" />
      </div>
    </div>
  </DashboardListItemDialog>

  <DashboardListItemDialog
    v-model:open="manageOpen"
    :title="`Manage ${noun}`"
    :show-actions="false"
  >
    <div v-if="booking" class="space-y-2">
      <UButton
        v-if="callTo"
        :to="callTo"
        icon="i-lucide-phone"
        color="neutral"
        variant="ghost"
        size="xl"
        block
        class="justify-start"
      >
        <span class="text-left">
          <span class="block">{{ firstName(booking.guestName) }}'s phone number</span>
          <span class="mt-0.5 block text-sm font-normal text-muted">{{ booking.guestPhone }}</span>
        </span>
      </UButton>
      <USeparator class="my-4" />
      <UButton :label="`Change ${noun}`" icon="i-lucide-pencil" color="neutral" variant="ghost" size="xl" block class="justify-start" :to="`${bookingPath}/change`" @click="beginChange" />
      <UButton
        v-for="action in availableActions"
        :key="action.value"
        :label="action.label"
        :icon="action.icon"
        :color="action.color"
        variant="ghost"
        size="xl"
        block
        class="justify-start"
        :loading="pendingAction === action.value"
        @click="action.value === 'cancel' ? openCancel() : runAction(action.value)"
      />
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
import DashboardListItemDialog from '~/components/dashboard/DashboardListItemDialog.vue'
import EditorPaneShell from '~/components/dashboard/EditorPaneShell.vue'
import { bookingNeedsResponse } from '~/utils/booking-lifecycle'
import { resolveBookingPresentation } from '~/utils/booking-presentation'
import { getErrorMessage } from '~/utils/errors'
import type { DashboardBookingDetails, DashboardBookingType } from '~/server/utils/dashboard-booking-details'

const props = defineProps<{
  bookingType: DashboardBookingType
  bookingId: string
}>()

type ActionColor = 'success' | 'error' | 'neutral'

const route = useRoute()
const router = useRouter()
const dashboardApi = useDashboardApi()
const realtime = useDashboardInvalidations()
const requestEvent = useRequestEvent()
const toast = useToast()
const orgSlug = computed(() => String(route.params.orgSlug || ''))
const todayPath = computed(() => `/dashboard/${orgSlug.value}`)
const bookingPath = computed(() => `${todayPath.value}/bookings/${props.bookingType}/${encodeURIComponent(props.bookingId)}`)
const editorSegments = computed(() => Array.isArray(route.params.editor) ? route.params.editor : route.params.editor ? [route.params.editor] : [])
const editorKey = computed(() => editorSegments.value[0] || '')
const editorField = computed(() => editorSegments.value[1] || '')
const isChangeMode = computed(() => editorKey.value === 'change')
const selectedNote = computed(() => booking.value?.notes.find(note => note.id === editorField.value))
const detailTitle = computed(() => editorKey.value === 'notes' ? editorField.value ? 'Edit note' : 'Add a note' : editorKey.value === 'guest' ? 'Guest details' : isChangeMode.value && editorField.value ? `Change ${editorField.value}` : undefined)

const isBookingResponse = (value: unknown): value is { booking: DashboardBookingDetails } =>
  isRecord(value)
  && isRecord(value.booking)
  && typeof value.booking.id === 'string'
  && typeof value.booking.siteId === 'string'
  && typeof value.booking.guestName === 'string'
  && Array.isArray(value.booking.notes)
  && isRecord(value.booking.policy)

const detailsKey = computed(() => `dashboard-booking:${orgSlug.value}:${props.bookingType}:${props.bookingId}`)
const { data: resource, pending, error } = await useAsyncData<{ booking: DashboardBookingDetails }>(detailsKey, async () => {
  if (import.meta.server) {
    if (!requestEvent) throw createError({ statusCode: 500, statusMessage: 'Dashboard request context unavailable' })
    const { loadDashboardBookingDetails } = await import('~/server/utils/dashboard-booking-details')
    return { booking: await loadDashboardBookingDetails(requestEvent, {
      type: props.bookingType,
      bookingId: props.bookingId,
      organizationSlug: orgSlug.value,
    }) }
  }
  return await dashboardApi(`/api/dashboard/bookings/${props.bookingType}/${encodeURIComponent(props.bookingId)}`, {
    validate: isBookingResponse,
  })
})

const booking = computed(() => resource.value?.booking ?? null)
watchEffect(() => {
  const valid = editorSegments.value.length <= 2 && (!editorKey.value
    || (editorKey.value === 'guest' && !editorField.value)
    || (editorKey.value === 'notes' && (!editorField.value || Boolean(selectedNote.value)))
    || (isChangeMode.value && (!editorField.value || ['date', 'time', 'guests', 'location'].includes(editorField.value))))
  if (!valid && booking.value) throw createError({ statusCode: 404, statusMessage: 'Editor not found' })
})

// The one vocabulary. `resolveBookingPresentation` refuses a missing vertical
// rather than guessing, so it is only asked once the booking has loaded.
const presentation = computed(() => booking.value
  ? resolveBookingPresentation(booking.value.type, booking.value.vertical)
  : null)
const noun = computed(() => presentation.value?.noun ?? '')

const referenceDay = computed(() => booking.value ? new Intl.DateTimeFormat('en-CA', { timeZone: booking.value.timeZone }).format(new Date()) : '')
const pageTitle = computed(() => {
  if (!booking.value) return 'Booking details'
  if (booking.value.status === 'cancelled') return 'Cancelled'
  if (booking.value.bookingDate === referenceDay.value) return 'Currently hosting'
  if (booking.value.bookingDate > referenceDay.value) return 'Coming up'
  return `Past ${noun.value}`
})
const formattedDate = computed(() => booking.value ? new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${booking.value.bookingDate}T12:00:00Z`)) : '')
const formattedTime = computed(() => {
  if (!booking.value) return ''
  const [hour, minute] = booking.value.bookingTime.split(':').map(Number)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)))
})
const guestCountLabel = computed(() => `${booking.value?.partySize ?? 0} ${(booking.value?.partySize ?? 0) === 1 ? 'guest' : 'guests'}`)
const statusLabel = computed(() => {
  const status = booking.value?.status || ''
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : ''
})
const cancellationSummary = computed(() => booking.value?.policy.items.find(item => item.id === 'cancellation')?.text
  || 'No cancellation terms have been configured.')
const messageTo = computed(() => {
  if (!booking.value?.threadId) return null
  return `/dashboard/${orgSlug.value}/sites/${booking.value.siteSlug}/locations/${booking.value.locationSlug}/inbox/${booking.value.threadId}`
})
const callTo = computed(() => booking.value?.guestPhone ? `tel:${booking.value.guestPhone}` : null)

const policyOpen = ref(false)
const manageOpen = ref(false)
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
const changeDirty = computed(() => Boolean(booking.value) && (changeDraft.value.bookingDate !== booking.value?.bookingDate || changeDraft.value.bookingTime !== booking.value?.bookingTime.slice(0, 5) || changeDraft.value.partySize !== booking.value?.partySize || changeDraft.value.locationId !== booking.value?.locationId))
const changeFields = computed(() => [
  { key: 'date', label: 'Date', summary: changeDraft.value.bookingDate ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${changeDraft.value.bookingDate}T12:00:00Z`)) : 'Choose a date' },
  { key: 'time', label: 'Time', summary: changeDraft.value.bookingTime ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(`2000-01-01T${changeDraft.value.bookingTime}:00Z`)) : 'Choose a time' },
  { key: 'guests', label: 'Guests', summary: `${changeDraft.value.partySize} ${changeDraft.value.partySize === 1 ? 'guest' : 'guests'}` },
])
const changeValid = computed(() => Boolean(changeDraft.value.bookingDate && changeDraft.value.bookingTime && Number.isInteger(changeDraft.value.partySize) && changeDraft.value.partySize > 0))
const pendingAction = ref<string | null>(null)
const actionAttempt = ref<{ draft: string; key: string } | null>(null)
const noteDraft = ref('')
const noteSaving = ref(false)
const noteAttemptKey = ref<string | null>(null)
const noteAttemptDraft = ref<string | null>(null)

watch([booking, editorKey, editorField], ([currentBooking, key]) => {
  noteDraft.value = selectedNote.value?.body || ''
  noteAttemptKey.value = null
  noteAttemptDraft.value = null
  // A field leaf is a route, so Nuxt may recreate this component while moving
  // between it and the change hub. Keep the one staged draft in Nuxt state and
  // only reseed it when it belongs to an older source revision.
  if (currentBooking && key === 'change' && changeDraft.value.sourceUpdatedAt !== currentBooking.updatedAt) resetChangeDraft()
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
  manageOpen.value = false
  resetChangeDraft()
}

const availableActions = computed<Array<{ value: string; label: string; icon: string; color: ActionColor }>>(() => {
  if (!booking.value || !presentation.value || !booking.value.threadId) return []
  const label = presentation.value.noun
  const cancel = { value: 'cancel', label: `Cancel ${label}`, icon: 'i-lucide-calendar-x', color: 'error' as const }
  if (bookingNeedsResponse(booking.value.type, booking.value.status)) {
    return [{ value: 'confirm', label: `Confirm ${label}`, icon: 'i-lucide-calendar-check', color: 'success' }, cancel]
  }
  if (booking.value.status !== 'confirmed') return []
  return booking.value.type === 'reservation'
    ? [{ value: 'complete', label: 'Mark complete', icon: 'i-lucide-check-check', color: 'neutral' }, cancel]
    : [cancel]
})

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value))
}

function closeEditor() {
  return router.push(isChangeMode.value && editorField.value ? `${bookingPath.value}/change` : bookingPath.value)
}

function cancelEditor() {
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
  manageOpen.value = false
  cancelNote.value = ''
  cancelOpen.value = true
}

async function refreshDetails() {
  const response = await dashboardApi<{ booking: DashboardBookingDetails }>(
    `/api/dashboard/bookings/${props.bookingType}/${encodeURIComponent(props.bookingId)}`,
    { validate: isBookingResponse },
  )
  resource.value = response
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
  try {
    const response = await dashboardApi<{ booking: DashboardBookingDetails }>(
      `/api/dashboard/bookings/${props.bookingType}/${encodeURIComponent(props.bookingId)}/notes`,
      {
        method: 'POST',
        body: { note: noteDraft.value, idempotencyKey: noteAttemptKey.value, noteId: selectedNote.value?.id, revisionId: selectedNote.value?.revisionId },
        validate: isBookingResponse,
      },
    )
    resource.value = response
    await closeEditor()
    toast.add({ description: 'Note saved', color: 'success' })
  } catch (cause) {
    toast.add({ description: getErrorMessage(cause, 'Note could not be saved'), color: 'error' })
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
  try {
    const proposal = {
      bookingDate: changeDraft.value.bookingDate,
      bookingTime: changeDraft.value.bookingTime,
      partySize: changeDraft.value.partySize,
      locationId: changeDraft.value.locationId,
    }
    const response = await dashboardApi<{ booking: DashboardBookingDetails }>(
      `/api/dashboard/bookings/${props.bookingType}/${encodeURIComponent(props.bookingId)}/changes`,
      {
        method: 'POST',
        body: { ...proposal, expectedUpdatedAt: booking.value?.updatedAt, idempotencyKey: changeAttemptKey.value },
        validate: isBookingResponse,
      },
    )
    resource.value = response
    resetChangeDraft()
    await closeEditor()
    toast.add({ description: `Change request sent by email. Your ${noun.value} stays unchanged until the guest accepts.`, color: 'success' })
  } catch (cause) {
    toast.add({ description: getErrorMessage(cause, 'Change request could not be sent'), color: 'error' })
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
  try {
    await dashboardApi(`/api/dashboard/sites/${booking.value.siteId}/guest-threads/${booking.value.threadId}/operations/${action}`, {
      method: 'POST',
      body: { idempotencyKey: actionAttempt.value.key, ...(note ? { body: note } : {}) },
      validate: (value: unknown): value is { thread: Record<string, unknown> } => isRecord(value) && isRecord(value.thread),
    })
    await refreshDetails()
    actionAttempt.value = null
    manageOpen.value = false
    cancelOpen.value = false
    toast.add({ description: `${statusActionLabel(action)} applied`, color: 'success' })
  } catch (cause) {
    toast.add({ description: getErrorMessage(cause, 'Booking could not be updated'), color: 'error' })
  } finally {
    pendingAction.value = null
  }
}

function statusActionLabel(action: string) {
  if (action === 'confirm') return 'Confirmation'
  if (action === 'complete') return 'Completion'
  return 'Cancellation'
}
</script>
