<template>
  <div class="flex flex-1 overflow-hidden lg:grid lg:grid-cols-[340px_minmax(0,1fr)_320px]">
    <aside
      class="border-b border-default lg:block lg:border-b-0 lg:border-r bg-elevated"
      :class="mobileView === 'thread' ? 'hidden' : 'block'"
    >
          <div class="border-b border-default px-3.5 py-3.5">
            <h1 class="text-xl font-semibold text-highlighted">Inbox</h1>
          </div>

          <div class="border-b border-default px-3.5 py-3.5">
            <UInput
              v-model="search"
              placeholder="Search guest, email, subject…"
              icon="i-lucide-search"
              size="sm"
            />
          </div>

          <div class="max-h-[28rem] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
            <ThreadRow
              v-for="thread in threads"
              :key="thread.id"
              :thread="thread"
              :active="selectedThreadId === thread.id"
              @select="selectThread"
            />

            <div v-if="!loadingThreads && threads.length === 0" class="px-6 py-12 text-center">
              <UIcon name="i-lucide-inbox" class="mx-auto size-8 text-muted" />
              <p class="mt-3 text-sm font-medium text-highlighted">No guest threads yet</p>
              <p class="mt-1 text-xs text-muted">New contact, reservation, and booking conversations will appear here.</p>
            </div>
          </div>
        </aside>

        <section
          class="min-h-0 flex-col border-b border-default lg:flex lg:border-b-0 lg:border-r bg-default"
          :class="mobileView === 'list' ? 'hidden' : 'flex'"
        >
          <div class="border-b border-default px-3.5 py-3.5 bg-elevated" v-if="selectedDetail">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex min-w-0 items-start gap-2">
                <UButton
                  icon="i-lucide-arrow-left"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  square
                  class="-ml-2 shrink-0 lg:hidden"
                  aria-label="Back to guest threads"
                  @click="closeMobileThread"
                />
                <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-default">
                  {{ selectedDetail.thread.guest_name.charAt(0) }}
                </div>
                <div class="min-w-0">
                  <h2 class="text-sm font-semibold text-highlighted">{{ selectedDetail.thread.guest_name }}</h2>
                  <div class="mt-1 flex flex-wrap items-center gap-2">
                    <TypeBadge :type="selectedDetail.thread.submission_type" size="xs" />
                    <UBadge variant="subtle" color="neutral" size="xs">{{ selectedDetail.source.location_title || 'Site-wide' }}</UBadge>
                  </div>
                </div>
              </div>
              <StatusBadge :status="selectedDetail.thread.inbox_status" size="xs" />
            </div>
          </div>

          <div class="min-h-0 flex-1">
            <div v-if="loadingDetail" class="space-y-3 p-4">
              <USkeleton v-for="i in 6" :key="i" class="h-16 rounded-xl" />
            </div>
            <div v-else-if="selectedDetail" class="flex h-full min-h-0 flex-col">
              <div class="px-4 pb-0 pt-2.5 lg:hidden">
                <div class="inline-flex gap-0.5 bg-muted border border-default rounded-lg p-0.5">
                  <button
                    type="button"
                    class="h-7 px-3 rounded text-xs font-semibold border-0 cursor-pointer"
                    :class="mobileTab === 'conversation' ? 'bg-elevated text-default shadow-sm' : 'bg-transparent text-muted'"
                    @click="mobileTab = 'conversation'"
                  >
                    Conversation
                  </button>
                  <button
                    type="button"
                    class="h-7 px-3 rounded text-xs font-semibold border-0 cursor-pointer"
                    :class="mobileTab === 'details' ? 'bg-elevated text-default shadow-sm' : 'bg-transparent text-muted'"
                    @click="mobileTab = 'details'"
                  >
                    Details
                  </button>
                </div>
              </div>

              <div class="min-h-0 flex-1" :class="mobileTab === 'details' ? 'hidden lg:block' : 'block'">
                <GuestThreadConversation
                  v-model:input="replyDraft"
                  :messages="selectedDetail.timeline"
                  :loading="replySaving"
                  :disabled="replySaving"
                  :cancelable="false"
                  empty-title="No replies yet"
                  empty-description="This thread will grow here as guests reply."
                  @submit="sendReply"
                />
              </div>
            </div>
            <div v-else class="flex h-full items-center justify-center px-6 py-16 text-center">
              <div>
                <UIcon name="i-lucide-messages-square" class="mx-auto size-8 text-muted" />
                <p class="mt-3 text-sm font-medium text-highlighted">Select a thread</p>
                <p class="mt-1 text-xs text-muted">Pick a guest conversation to read the thread and reply by email.</p>
              </div>
            </div>
          </div>
        </section>

        <aside
          class="min-h-0 overflow-y-auto bg-muted"
          :class="mobileView === 'list' || mobileTab === 'conversation' ? 'hidden lg:block' : 'block'"
        >
          <div v-if="selectedDetail" class="space-y-4 p-4">
            <ContextCard title="Guest">
              <div class="space-y-2">
                <p class="font-semibold text-default">{{ selectedDetail.source.guest_name }}</p>
                <p v-if="selectedDetail.source.guest_email" class="flex items-center gap-2 text-dimmed">
                  <UIcon name="i-lucide-mail" class="size-3" />
                  {{ selectedDetail.source.guest_email }}
                </p>
                <p v-if="selectedDetail.source.guest_phone" class="flex items-center gap-2 text-dimmed">
                  <UIcon name="i-lucide-phone" class="size-3" />
                  {{ selectedDetail.source.guest_phone }}
                </p>
              </div>
            </ContextCard>

            <SubmissionDetails :source="selectedDetail.source" />

            <OperationalActions
              :type="selectedDetail.source.submission_type"
              @confirm="handleConfirm"
              @complete="handleComplete"
              @cancel="handleCancel"
            />
          </div>
        </aside>
      </div>
</template>

<script setup lang="ts">
import GuestThreadConversation from '~/components/conversation/GuestThreadConversation.vue'
import TypeBadge from '~/components/workspace/dashboard/TypeBadge.vue'
import StatusBadge from '~/components/workspace/dashboard/StatusBadge.vue'
import ContextCard from '~/components/workspace/dashboard/ContextCard.vue'
import ThreadRow from '~/components/workspace/dashboard/ThreadRow.vue'
import SubmissionDetails from '~/components/workspace/dashboard/SubmissionDetails.vue'
import OperationalActions from '~/components/workspace/dashboard/OperationalActions.vue'

definePageMeta({ layout: 'dashboard' })

type SubmissionType = 'contact' | 'reservation' | 'experience_booking'
type InboxStatus = 'open' | 'waiting_on_owner' | 'waiting_on_guest' | 'closed'

interface ThreadSummary {
  id: string
  submission_type: SubmissionType
  submission_id: string
  guest_name: string
  guest_email: string | null
  guest_phone: string | null
  inbox_status: InboxStatus
  unread_count: number
  last_message_at: string | null
  last_message_preview: string | null
  created_at: string
  location_title: string | null
  subject: string | null
  experience_title: string | null
  operational_status: string
}

interface TimelineItem {
  id: string
  type: 'message' | 'event'
  role: 'guest' | 'owner' | 'system'
  body: string
  createdAt: string
  channel?: 'email' | 'whatsapp' | 'web'
}

type ThreadSource =
  | {
    submission_type: 'contact'
    guest_name: string
    guest_email: string | null
    guest_phone: string | null
    location_id: null
    location_title?: null
    created_at: string
    operational_status: string
    subject: string | null
    message: string
    experience_title: string | null
  }
  | {
    submission_type: 'reservation'
    guest_name: string
    guest_email: string | null
    guest_phone: string | null
    location_id: string | null
    location_title: string | null
    created_at: string
    operational_status: string
    date: string
    time: string
    guests: string
    requests: string | null
  }
  | {
    submission_type: 'experience_booking'
    guest_name: string
    guest_email: string | null
    guest_phone: string | null
    location_id: string | null
    location_title: string | null
    created_at: string
    operational_status: string
    booking_date: string
    time_slot: string
    party_size: number
    notes: string | null
    experience_title: string | null
  }

interface ThreadDetailResponse {
  thread: ThreadSummary
  source: ThreadSource
  timeline: TimelineItem[]
}

const siteId = await useDashboardSiteId()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const dashboardLocation = useDashboardLocation()
const sitePublicUrl = ref<string | null>(null)
const selectedLocationId = computed(() => dashboardLocation.currentLocationId.value)
const loadingThreads = ref(false)
const loadingDetail = ref(false)
const threads = ref<ThreadSummary[]>([])
const selectedThreadId = ref<string | null>(null)
const selectedDetail = ref<ThreadDetailResponse | null>(null)
const replyDraft = ref('')
const replySaving = ref(false)
const mobileView = ref<'list' | 'thread'>('list')
const mobileTab = ref<'conversation' | 'details'>('conversation')
const search = ref('')
const selectedInboxStatus = ref<InboxStatus>('open')
const { buildHeaderLinks } = useDashboardSiteLinks(siteId, sitePublicUrl)
const _headerLinks = computed(() => buildHeaderLinks())

const statusOptions = computed(() => [
  { label: 'Open', value: 'open' },
  { label: 'Waiting on owner', value: 'waiting_on_owner' },
  { label: 'Waiting on guest', value: 'waiting_on_guest' },
  { label: 'Closed', value: 'closed' }
])

let searchTimer: ReturnType<typeof setTimeout> | null = null

async function loadBaseContext() {
  const settingsRes = await $fetch<{ settings: { public_url: string | null } }>('/api/dashboard/settings')
  sitePublicUrl.value = settingsRes.settings.public_url
}

async function loadThreads() {
  if (!selectedLocationId.value) return
  loadingThreads.value = true
  try {
    const res = await $fetch<{ threads: ThreadSummary[] }>(`/api/dashboard/sites/${siteId}/guest-threads`, {
      query: {
        location_id: selectedLocationId.value,
        search: search.value || undefined,
      },
    })
    threads.value = res.threads ?? []
    await applyRouteSelection()
  } finally {
    loadingThreads.value = false
  }
}

async function loadThreadDetail(threadId: string) {
  loadingDetail.value = true
  selectedThreadId.value = null
  selectedDetail.value = null
  try {
    const res = await $fetch<ThreadDetailResponse>(`/api/dashboard/sites/${siteId}/guest-threads/${threadId}`)
    selectedThreadId.value = threadId
    selectedDetail.value = res
    selectedInboxStatus.value = res.thread.inbox_status
    replyDraft.value = ''
    return true
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load thread', color: 'error' })
    return false
  } finally {
    loadingDetail.value = false
  }
}

async function applyRouteSelection() {
  const explicitThread = typeof route.query.thread === 'string' ? route.query.thread : null
  if (explicitThread) {
    if (!threads.value.some(thread => thread.id === explicitThread)) {
      selectedThreadId.value = null
      selectedDetail.value = null
      mobileView.value = 'list'
      mobileTab.value = 'conversation'
      return
    }
    const loaded = selectedThreadId.value === explicitThread && selectedDetail.value !== null
      ? true
      : await loadThreadDetail(explicitThread)
    mobileView.value = loaded ? 'thread' : 'list'
    if (loaded) mobileTab.value = 'conversation'
    return
  }

  const legacyReply = typeof route.query.reply === 'string' ? route.query.reply : null
  const tab = typeof route.query.tab === 'string' ? route.query.tab : null
  if (legacyReply) {
    const mappedType: SubmissionType | null = tab === 'contact'
      ? 'contact'
      : tab === 'reservations'
        ? 'reservation'
        : tab === 'bookings'
          ? 'experience_booking'
          : null
    const match = threads.value.find(thread => thread.submission_id === legacyReply && (!mappedType || thread.submission_type === mappedType))
    if (match) {
      await selectThread(match.id)
      return
    }
  }

  selectedThreadId.value = null
  selectedDetail.value = null
  mobileView.value = 'list'
  mobileTab.value = 'conversation'
  if (!isMobileInbox() && threads.value[0]) {
    await loadThreadDetail(threads.value[0].id)
  }
}

async function selectThread(threadId: string) {
  const loaded = await loadThreadDetail(threadId)
  if (!loaded) {
    mobileView.value = 'list'
    return
  }
  mobileView.value = 'thread'
  mobileTab.value = 'conversation'
  const query: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(route.query)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => [key, value as string]),
    ),
    thread: threadId,
  }
  delete query.reply
  delete query.tab
  await router.push({ query })
  await loadThreads()
}

async function closeMobileThread() {
  mobileView.value = 'list'
  mobileTab.value = 'conversation'
  const query = { ...route.query }
  delete query.thread
  await router.push({ query })
}

function isMobileInbox() {
  return import.meta.client && window.matchMedia('(max-width: 1023px)').matches
}

async function refreshThread(threadId: string) {
  await loadThreadDetail(threadId)
  await loadThreads()
}

async function sendReply() {
  if (!selectedThreadId.value || !replyDraft.value.trim()) return
  replySaving.value = true
  try {
    await $fetch(`/api/dashboard/sites/${siteId}/guest-threads/${selectedThreadId.value}/reply`, {
      method: 'POST',
      body: {
        channel: 'email',
        body: replyDraft.value,
      },
    })
    toast.add({ description: 'Reply sent', color: 'success' })
    await refreshThread(selectedThreadId.value)
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to send reply', color: 'error' })
  } finally {
    replySaving.value = false
  }
}

async function markSeen() {
  if (!selectedThreadId.value) return
  try {
    await $fetch(`/api/dashboard/sites/${siteId}/guest-threads/${selectedThreadId.value}`, {
      method: 'PATCH',
      body: { mark_seen: true },
    })
    await refreshThread(selectedThreadId.value)
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to mark thread as seen', color: 'error' })
  }
}

async function updateInboxStatus() {
  if (!selectedThreadId.value) return
  const previousStatus = selectedDetail.value?.thread.inbox_status ?? selectedInboxStatus.value
  try {
    await $fetch(`/api/dashboard/sites/${siteId}/guest-threads/${selectedThreadId.value}`, {
      method: 'PATCH',
      body: { inbox_status: selectedInboxStatus.value },
    })
    await refreshThread(selectedThreadId.value)
  } catch (error) {
    selectedInboxStatus.value = previousStatus
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update thread status', color: 'error' })
  }
}

async function updateContactStatus(status: 'read' | 'replied') {
  if (!selectedDetail.value || selectedDetail.value.source.submission_type !== 'contact') return
  try {
    await $fetch(`/api/editor/sites/${siteId}/contact-submissions/${selectedDetail.value.thread.submission_id}`, {
      method: 'PATCH',
      body: { status },
    })
    toast.add({ description: 'Contact status updated', color: 'success' })
    await refreshThread(selectedDetail.value.thread.id)
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update contact status', color: 'error' })
  }
}

async function updateReservationStatus(status: 'confirmed' | 'completed' | 'cancelled') {
  if (!selectedDetail.value || selectedDetail.value.source.submission_type !== 'reservation') return
  try {
    await $fetch(`/api/editor/sites/${siteId}/reservation-submissions/${selectedDetail.value.thread.submission_id}`, {
      method: 'PATCH',
      query: { location_id: selectedDetail.value.source.location_id ?? undefined },
      body: { status },
    })
    toast.add({ description: 'Reservation status updated', color: 'success' })
    await refreshThread(selectedDetail.value.thread.id)
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update reservation status', color: 'error' })
  }
}

async function updateBookingStatus(status: 'confirmed' | 'cancelled') {
  if (!selectedDetail.value || selectedDetail.value.source.submission_type !== 'experience_booking') return
  try {
    await $fetch(`/api/editor/sites/${siteId}/experience-bookings/${selectedDetail.value.thread.submission_id}`, {
      method: 'PATCH',
      body: { status },
    })
    toast.add({ description: 'Booking status updated', color: 'success' })
    await refreshThread(selectedDetail.value.thread.id)
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update booking status', color: 'error' })
  }
}

async function completeBooking() {
  if (!selectedDetail.value || selectedDetail.value.source.submission_type !== 'experience_booking') return
  try {
    await $fetch(`/api/editor/sites/${siteId}/experience-bookings/${selectedDetail.value.thread.submission_id}/complete`, { method: 'POST' })
    toast.add({ description: 'Booking completed', color: 'success' })
    await refreshThread(selectedDetail.value.thread.id)
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to complete booking', color: 'error' })
  }
}

function handleConfirm() {
  if (selectedDetail.value?.source.submission_type === 'reservation') {
    updateReservationStatus('confirmed')
  } else {
    updateBookingStatus('confirmed')
  }
}

function handleComplete() {
  if (selectedDetail.value?.source.submission_type === 'reservation') {
    updateReservationStatus('completed')
  } else {
    completeBooking()
  }
}

function handleCancel() {
  if (selectedDetail.value?.source.submission_type === 'reservation') {
    updateReservationStatus('cancelled')
  } else {
    updateBookingStatus('cancelled')
  }
}

function threadTypeLabel(type: SubmissionType) {
  if (type === 'contact') return 'Contact'
  if (type === 'reservation') return 'Reservation'
  return 'Booking'
}

function threadStateLabel(status: InboxStatus) {
  if (status === 'waiting_on_owner') return 'Waiting on owner'
  if (status === 'waiting_on_guest') return 'Waiting on guest'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void loadThreads()
  }, 250)
})

watch(() => dashboardLocation.currentLocationId.value, async () => {
  selectedThreadId.value = null
  selectedDetail.value = null
  mobileView.value = 'list'
  mobileTab.value = 'conversation'
  await loadThreads()
})

watch(() => route.query.thread, async () => {
  mobileTab.value = 'conversation'
  await applyRouteSelection()
})

onMounted(async () => {
  try {
    await loadBaseContext()
    await loadThreads()
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load inbox', color: 'error' })
  }
})

useSeoMeta({ title: 'Inbox | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
