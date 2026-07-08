<template>
  <UPage>
    <UPageBody class="px-0 sm:px-0">
      <div class="flex min-h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-2xl border border-default bg-default lg:grid lg:grid-cols-[340px_minmax(0,1fr)_320px]">
        <aside class="border-b border-default lg:border-b-0 lg:border-r">
          <div class="border-b border-default px-4 py-4">
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Guest Threads</p>
            <h1 class="mt-1 text-xl font-semibold text-highlighted">Inbox</h1>
            <p class="mt-1 text-sm text-muted">Unified guest conversations across contact, reservations, and bookings.</p>
          </div>

          <div class="space-y-3 border-b border-default px-4 py-4">
            <input
              v-model="search"
              type="search"
              placeholder="Search guest, email, subject…"
              class="w-full rounded-xl border border-default bg-elevated px-3 py-2.5 text-sm outline-none transition focus:border-primary"
            >

            <div class="grid grid-cols-2 gap-2">
              <select v-model="typeFilter" class="rounded-xl border border-default bg-elevated px-3 py-2 text-sm">
                <option value="">All types</option>
                <option value="contact">Contact</option>
                <option value="reservation">Reservations</option>
                <option value="experience_booking">Bookings</option>
              </select>
              <select v-model="inboxStatusFilter" class="rounded-xl border border-default bg-elevated px-3 py-2 text-sm">
                <option value="">All states</option>
                <option value="open">Open</option>
                <option value="waiting_on_owner">Waiting on owner</option>
                <option value="waiting_on_guest">Waiting on guest</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <label class="flex items-center gap-2 text-sm text-muted">
              <input v-model="unreadOnly" type="checkbox" class="rounded border-default">
              Unread only
            </label>
          </div>

          <div class="max-h-[28rem] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
            <button
              v-for="thread in threads"
              :key="thread.id"
              type="button"
              class="flex w-full flex-col gap-2 border-b border-default px-4 py-4 text-left transition hover:bg-elevated"
              :class="selectedThreadId === thread.id ? 'bg-elevated' : ''"
              @click="selectThread(thread.id)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <p class="truncate text-sm font-semibold text-highlighted">{{ thread.guest_name }}</p>
                    <span v-if="thread.unread_count > 0" class="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                      {{ thread.unread_count }}
                    </span>
                  </div>
                  <p class="mt-1 truncate text-xs text-muted">{{ threadSecondaryLine(thread) }}</p>
                </div>
                <span class="shrink-0 text-[11px] text-muted">{{ formatRelative(thread.last_message_at || thread.created_at) }}</span>
              </div>

              <div class="flex flex-wrap items-center gap-2 text-[11px]">
                <span class="rounded-full border border-default px-2 py-0.5 text-muted">{{ threadTypeLabel(thread.submission_type) }}</span>
                <span class="rounded-full border border-default px-2 py-0.5 text-muted">{{ thread.location_title || 'Site-wide' }}</span>
                <span class="rounded-full border border-default px-2 py-0.5 text-muted">{{ threadStateLabel(thread.inbox_status) }}</span>
                <span class="rounded-full border border-default px-2 py-0.5 text-muted">{{ thread.operational_status }}</span>
              </div>

              <p class="line-clamp-2 text-sm text-default">{{ thread.last_message_preview || 'Open thread' }}</p>
            </button>

            <div v-if="!loadingThreads && threads.length === 0" class="px-6 py-12 text-center">
              <UIcon name="i-lucide-inbox" class="mx-auto size-8 text-muted" />
              <p class="mt-3 text-sm font-medium text-highlighted">No guest threads yet</p>
              <p class="mt-1 text-xs text-muted">New contact, reservation, and booking conversations will appear here.</p>
            </div>
          </div>
        </aside>

        <section class="flex min-h-0 flex-col border-b border-default lg:border-b-0 lg:border-r">
          <div class="border-b border-default px-4 py-4" v-if="selectedDetail">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-lg font-semibold text-highlighted">{{ selectedDetail.thread.guest_name }}</h2>
                <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>{{ threadTypeLabel(selectedDetail.thread.submission_type) }}</span>
                  <span>•</span>
                  <span>{{ selectedDetail.source.location_title || 'Site-wide' }}</span>
                  <span>•</span>
                  <span>{{ threadStateLabel(selectedDetail.thread.inbox_status) }}</span>
                </div>
              </div>
              <div class="flex gap-2">
                <UButton size="sm" color="neutral" variant="ghost" @click="markSeen" :disabled="selectedDetail.thread.unread_count === 0">Mark seen</UButton>
                <select v-model="selectedInboxStatus" class="rounded-xl border border-default bg-elevated px-3 py-2 text-sm" @change="updateInboxStatus">
                  <option value="open">Open</option>
                  <option value="waiting_on_owner">Waiting on owner</option>
                  <option value="waiting_on_guest">Waiting on guest</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>
          </div>

          <div class="min-h-0 flex-1">
            <div v-if="loadingDetail" class="space-y-3 p-4">
              <USkeleton v-for="i in 6" :key="i" class="h-16 rounded-xl" />
            </div>
            <div v-else-if="selectedDetail" class="flex h-full min-h-0 flex-col">
              <div class="flex items-center gap-2 border-b border-default px-4 py-2 text-xs lg:hidden">
                <button
                  type="button"
                  class="rounded-full px-3 py-1.5"
                  :class="mobileTab === 'conversation' ? 'bg-primary text-white' : 'bg-elevated text-muted'"
                  @click="mobileTab = 'conversation'"
                >
                  Conversation
                </button>
                <button
                  type="button"
                  class="rounded-full px-3 py-1.5"
                  :class="mobileTab === 'details' ? 'bg-primary text-white' : 'bg-elevated text-muted'"
                  @click="mobileTab = 'details'"
                >
                  Details
                </button>
              </div>

              <div class="min-h-0 flex-1" :class="mobileTab === 'details' ? 'hidden lg:block' : 'block'">
                <GuestThreadConversation
                  v-model:input="replyDraft"
                  :messages="selectedDetail.timeline"
                  :loading="replySaving"
                  :disabled="replySaving"
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
          class="min-h-0 overflow-y-auto"
          :class="mobileTab === 'conversation' ? 'hidden lg:block' : 'block'"
        >
          <div v-if="selectedDetail" class="space-y-4 p-4">
            <UCard :ui="{ body: 'p-4' }">
              <h3 class="text-sm font-semibold text-highlighted">Guest</h3>
              <div class="mt-3 space-y-2 text-sm">
                <p><span class="text-muted">Name:</span> {{ selectedDetail.source.guest_name }}</p>
                <p v-if="selectedDetail.source.guest_email"><span class="text-muted">Email:</span> {{ selectedDetail.source.guest_email }}</p>
                <p v-if="selectedDetail.source.guest_phone"><span class="text-muted">Phone:</span> {{ selectedDetail.source.guest_phone }}</p>
              </div>
            </UCard>

            <UCard :ui="{ body: 'p-4' }">
              <h3 class="text-sm font-semibold text-highlighted">Submission details</h3>
              <div class="mt-3 space-y-2 text-sm">
                <template v-if="selectedDetail.source.submission_type === 'contact'">
                  <p v-if="selectedDetail.source.subject"><span class="text-muted">Subject:</span> {{ selectedDetail.source.subject }}</p>
                  <p v-if="selectedDetail.source.experience_title"><span class="text-muted">Regarding:</span> {{ selectedDetail.source.experience_title }}</p>
                  <p><span class="text-muted">Submitted:</span> {{ formatDate(selectedDetail.source.created_at) }}</p>
                  <p class="whitespace-pre-wrap"><span class="text-muted">Message:</span> {{ selectedDetail.source.message }}</p>
                </template>
                <template v-else-if="selectedDetail.source.submission_type === 'reservation'">
                  <p><span class="text-muted">Location:</span> {{ selectedDetail.source.location_title }}</p>
                  <p><span class="text-muted">Date:</span> {{ selectedDetail.source.date }}</p>
                  <p><span class="text-muted">Time:</span> {{ selectedDetail.source.time }}</p>
                  <p><span class="text-muted">Guests:</span> {{ selectedDetail.source.guests }}</p>
                  <p v-if="selectedDetail.source.requests"><span class="text-muted">Requests:</span> {{ selectedDetail.source.requests }}</p>
                </template>
                <template v-else>
                  <p><span class="text-muted">Location:</span> {{ selectedDetail.source.location_title }}</p>
                  <p><span class="text-muted">Experience:</span> {{ selectedDetail.source.experience_title }}</p>
                  <p><span class="text-muted">Date:</span> {{ selectedDetail.source.booking_date }}</p>
                  <p><span class="text-muted">Time:</span> {{ selectedDetail.source.time_slot }}</p>
                  <p><span class="text-muted">Party size:</span> {{ selectedDetail.source.party_size }}</p>
                  <p v-if="selectedDetail.source.notes"><span class="text-muted">Notes:</span> {{ selectedDetail.source.notes }}</p>
                </template>
              </div>
            </UCard>

            <UCard :ui="{ body: 'p-4' }">
              <h3 class="text-sm font-semibold text-highlighted">Operational actions</h3>
              <div class="mt-3 flex flex-wrap gap-2">
                <template v-if="selectedDetail.source.submission_type === 'contact'">
                  <UButton size="sm" color="neutral" variant="ghost" @click="updateContactStatus('read')">Mark read</UButton>
                  <UButton size="sm" color="neutral" variant="soft" @click="updateContactStatus('replied')">Mark replied</UButton>
                </template>
                <template v-else-if="selectedDetail.source.submission_type === 'reservation'">
                  <UButton size="sm" color="success" variant="ghost" @click="updateReservationStatus('confirmed')">Confirm</UButton>
                  <UButton size="sm" color="neutral" variant="ghost" @click="updateReservationStatus('completed')">Complete</UButton>
                  <UButton size="sm" color="error" variant="ghost" @click="updateReservationStatus('cancelled')">Cancel</UButton>
                </template>
                <template v-else>
                  <UButton size="sm" color="success" variant="ghost" @click="updateBookingStatus('confirmed')">Confirm</UButton>
                  <UButton size="sm" color="neutral" variant="ghost" @click="completeBooking">Complete</UButton>
                  <UButton size="sm" color="error" variant="ghost" @click="updateBookingStatus('cancelled')">Cancel</UButton>
                </template>
              </div>
            </UCard>
          </div>
        </aside>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import GuestThreadConversation from '~/components/conversation/GuestThreadConversation.vue'

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
const mobileTab = ref<'conversation' | 'details'>('conversation')
const search = ref('')
const typeFilter = ref<string>('')
const inboxStatusFilter = ref<string>('')
const unreadOnly = ref(false)
const selectedInboxStatus = ref<InboxStatus>('open')
const { buildHeaderLinks } = useDashboardSiteLinks(siteId, sitePublicUrl)
const _headerLinks = computed(() => buildHeaderLinks())

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
        type: typeFilter.value || undefined,
        inbox_status: inboxStatusFilter.value || undefined,
        unread: unreadOnly.value ? '1' : undefined,
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
  try {
    const res = await $fetch<ThreadDetailResponse>(`/api/dashboard/sites/${siteId}/guest-threads/${threadId}`)
    selectedThreadId.value = threadId
    selectedDetail.value = res
    selectedInboxStatus.value = res.thread.inbox_status
    replyDraft.value = ''
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load thread', color: 'error' })
  } finally {
    loadingDetail.value = false
  }
}

async function applyRouteSelection() {
  const explicitThread = typeof route.query.thread === 'string' ? route.query.thread : null
  if (explicitThread && threads.value.some(thread => thread.id === explicitThread)) {
    if (selectedThreadId.value !== explicitThread) await loadThreadDetail(explicitThread)
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

  if (!selectedThreadId.value && threads.value[0]) {
    await selectThread(threads.value[0].id)
  }
}

async function selectThread(threadId: string) {
  await loadThreadDetail(threadId)
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
  await router.replace({ query })
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
    await Promise.all([loadThreadDetail(selectedThreadId.value), loadThreads()])
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
    await Promise.all([loadThreadDetail(selectedThreadId.value), loadThreads()])
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
    await Promise.all([loadThreadDetail(selectedThreadId.value), loadThreads()])
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
    await Promise.all([loadThreadDetail(selectedDetail.value.thread.id), loadThreads()])
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
    await Promise.all([loadThreadDetail(selectedDetail.value.thread.id), loadThreads()])
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
    await Promise.all([loadThreadDetail(selectedDetail.value.thread.id), loadThreads()])
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to update booking status', color: 'error' })
  }
}

async function completeBooking() {
  if (!selectedDetail.value || selectedDetail.value.source.submission_type !== 'experience_booking') return
  try {
    await $fetch(`/api/editor/sites/${siteId}/experience-bookings/${selectedDetail.value.thread.submission_id}/complete`, { method: 'POST' })
    toast.add({ description: 'Booking completed', color: 'success' })
    await Promise.all([loadThreadDetail(selectedDetail.value.thread.id), loadThreads()])
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to complete booking', color: 'error' })
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

function threadSecondaryLine(thread: ThreadSummary) {
  if (thread.submission_type === 'contact') return thread.experience_title || thread.subject || 'Website message'
  if (thread.submission_type === 'reservation') return thread.last_message_preview || 'Reservation thread'
  return thread.experience_title || 'Experience booking'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatRelative(value: string) {
  const delta = Date.now() - new Date(value).getTime()
  const minutes = Math.round(delta / 60000)
  if (minutes < 60) return `${Math.max(minutes, 1)}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  return `${days}d`
}

watch([typeFilter, inboxStatusFilter, unreadOnly], () => {
  void loadThreads()
})

watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void loadThreads()
  }, 250)
})

watch(() => dashboardLocation.currentLocationId.value, async () => {
  await loadThreads()
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
