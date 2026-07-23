<template>
  <UDashboardPanel :id="panelId">
    <template #header>
      <UDashboardNavbar :title="navbarTitle">
        <template #leading>
          <DashboardSidebarCollapseButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex min-h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-xl border border-default bg-default shadow-sm lg:grid lg:grid-cols-[360px_minmax(0,1fr)_340px]">
        <aside
          class="min-h-0 border-b border-default bg-muted/30 lg:flex lg:flex-col lg:border-b-0 lg:border-r"
          :class="mobileView === 'thread' ? 'hidden' : 'block'"
        >
          <div class="border-b border-default px-4 py-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Guest Threads</p>
                <p class="mt-1 text-sm text-muted">{{ inboxDescription }}</p>
              </div>
              <UBadge v-if="threads.length > 0" color="neutral" variant="soft" size="sm" class="shrink-0 rounded-full">
                {{ threads.length }}
              </UBadge>
            </div>
          </div>

          <div class="space-y-3 border-b border-default px-4 py-4">
            <UInput
              v-model="search"
              type="search"
              icon="i-lucide-search"
              aria-label="Search guest threads"
              placeholder="Search guest, email, subject…"
              class="w-full"
            />

            <div class="grid grid-cols-2 gap-2">
              <select v-model="typeFilter" aria-label="Filter by submission type" class="min-w-0 rounded-lg border border-default bg-default px-3 py-2 text-sm text-highlighted">
                <option value="">All types</option>
                <option v-for="option in typeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
              <select v-model="inboxStatusFilter" aria-label="Filter by inbox status" class="min-w-0 rounded-lg border border-default bg-default px-3 py-2 text-sm text-highlighted">
                <option value="">All states</option>
                <option value="open">Open</option>
                <option value="waiting_on_owner">Waiting on owner</option>
                <option value="waiting_on_guest">Waiting on guest</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <label class="inline-flex items-center gap-2 rounded-full border border-default bg-default px-3 py-1.5 text-sm text-muted">
              <input v-model="unreadOnly" type="checkbox" class="rounded border-default text-primary">
              Unread only
            </label>
          </div>

          <div class="max-h-[28rem] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1">
            <button
              v-for="thread in threads"
              :key="thread.id"
              type="button"
              class="group flex w-full items-start gap-3 border-b border-default px-4 py-4 text-left transition hover:bg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              :class="selectedThreadId === thread.id ? 'bg-default shadow-[inset_3px_0_0_var(--ui-primary)]' : ''"
              @click="selectThread(thread.id)"
            >
              <div class="relative shrink-0">
                <div class="flex size-11 items-center justify-center rounded-full bg-elevated text-sm font-semibold text-highlighted ring-1 ring-default">
                  {{ thread.guest_name.charAt(0).toUpperCase() }}
                </div>
                <span class="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-default ring-1 ring-default">
                  <UIcon :name="threadTypeIcon(thread.submission_type)" class="size-3" :class="threadTypeIconClass(thread.submission_type)" />
                </span>
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex min-w-0 items-center gap-2">
                      <p class="truncate text-sm font-semibold text-highlighted">{{ thread.guest_name }}</p>
                      <span v-if="thread.unread_count > 0" class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-white">
                        {{ thread.unread_count }}
                      </span>
                    </div>
                    <p class="mt-1 truncate text-xs text-muted">{{ threadSecondaryLine(thread) }}</p>
                  </div>
                  <span class="shrink-0 text-[11px] text-dimmed">{{ formatRelative(thread.last_message_at || thread.created_at) }}</span>
                </div>

                <div class="mt-2 flex flex-wrap items-center gap-1.5">
                  <UBadge :color="threadTypeColor(thread.submission_type)" variant="soft" size="xs" class="rounded-full">
                    <UIcon :name="threadTypeIcon(thread.submission_type)" class="size-3" />
                    {{ threadTypeLabel(thread.submission_type) }}
                  </UBadge>
                  <UBadge :color="threadStateColor(thread.inbox_status)" variant="soft" size="xs" class="rounded-full">
                    {{ threadStateLabel(thread.inbox_status) }}
                  </UBadge>
                  <UBadge color="neutral" variant="outline" size="xs" class="max-w-full rounded-full">
                    <span class="truncate">{{ thread.location_title || 'Site-wide' }}</span>
                  </UBadge>
                </div>

                <p class="mt-2 line-clamp-2 text-sm text-default" :class="thread.unread_count > 0 ? 'font-medium text-highlighted' : ''">
                  {{ thread.last_message_preview || 'Open thread' }}
                </p>
                <p class="mt-1 truncate text-xs text-dimmed">{{ operationalStatusLabel(thread.operational_status) }}</p>
              </div>
            </button>

            <div v-if="!loadingThreads && threads.length === 0" class="px-6 py-12 text-center">
              <UIcon name="i-lucide-inbox" class="mx-auto size-8 text-muted" />
              <p class="mt-3 text-sm font-medium text-highlighted">No guest threads yet</p>
              <p class="mt-1 text-xs text-muted">{{ emptyDescription }}</p>
            </div>
          </div>
        </aside>

        <section
          class="min-h-0 flex-col border-b border-default lg:flex lg:border-b-0 lg:border-r"
          :class="mobileView === 'list' ? 'hidden' : 'flex'"
        >
          <div v-if="selectedDetail" class="border-b border-default bg-default px-4 py-4">
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
                <div class="min-w-0">
                  <h2 class="text-lg font-semibold text-highlighted">{{ selectedDetail.thread.guest_name }}</h2>
                  <div class="mt-2 flex flex-wrap items-center gap-1.5">
                    <UBadge :color="threadTypeColor(selectedDetail.thread.submission_type)" variant="soft" size="xs" class="rounded-full">
                      <UIcon :name="threadTypeIcon(selectedDetail.thread.submission_type)" class="size-3" />
                      {{ threadTypeLabel(selectedDetail.thread.submission_type) }}
                    </UBadge>
                    <UBadge color="neutral" variant="outline" size="xs" class="max-w-full rounded-full">
                      <span class="truncate">{{ selectedDetail.source.location_title || 'Site-wide' }}</span>
                    </UBadge>
                    <UBadge :color="threadStateColor(selectedDetail.thread.inbox_status)" variant="soft" size="xs" class="rounded-full">
                      {{ threadStateLabel(selectedDetail.thread.inbox_status) }}
                    </UBadge>
                  </div>
                </div>
              </div>
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-check-check" @click="markSeen" :disabled="selectedDetail.thread.unread_count === 0">Mark seen</UButton>
                <select v-model="selectedInboxStatus" aria-label="Change inbox status" class="min-w-0 rounded-lg border border-default bg-elevated px-3 py-2 text-sm text-highlighted" @change="updateInboxStatus">
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
          :class="mobileView === 'list' || mobileTab === 'conversation' ? 'hidden lg:block' : 'block'"
        >
          <div v-if="selectedDetail" class="space-y-4 p-4">
            <UCard class="border border-default shadow-none" :ui="{ body: 'p-4' }">
              <div class="flex items-center gap-3">
                <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-elevated text-sm font-semibold text-highlighted ring-1 ring-default">
                  {{ selectedDetail.source.guest_name.charAt(0).toUpperCase() }}
                </div>
                <div class="min-w-0">
                  <h3 class="truncate text-sm font-semibold text-highlighted">{{ selectedDetail.source.guest_name }}</h3>
                  <p class="mt-0.5 truncate text-xs text-muted">{{ selectedDetail.source.guest_email || selectedDetail.source.guest_phone || 'Guest contact' }}</p>
                </div>
              </div>
              <div class="mt-4 divide-y divide-dashed divide-default text-sm">
                <div v-if="selectedDetail.source.guest_email" class="grid gap-1 py-2 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                  <span class="text-dimmed">Email</span>
                  <span class="min-w-0 break-words text-default sm:text-right">{{ selectedDetail.source.guest_email }}</span>
                </div>
                <div v-if="selectedDetail.source.guest_phone" class="grid gap-1 py-2 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                  <span class="text-dimmed">Phone</span>
                  <span class="min-w-0 break-words text-default sm:text-right">{{ selectedDetail.source.guest_phone }}</span>
                </div>
                <div class="grid gap-1 py-2 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                  <span class="text-dimmed">Thread</span>
                  <span class="min-w-0 break-words text-default sm:text-right">{{ threadStateLabel(selectedDetail.thread.inbox_status) }}</span>
                </div>
              </div>
            </UCard>

            <UCard class="border border-default shadow-none" :ui="{ body: 'p-4' }">
              <div class="flex items-center justify-between gap-3">
                <h3 class="text-sm font-semibold text-highlighted">Submission details</h3>
                <UBadge :color="threadTypeColor(selectedDetail.source.submission_type)" variant="soft" size="xs" class="rounded-full">
                  {{ threadTypeLabel(selectedDetail.source.submission_type) }}
                </UBadge>
              </div>
              <div class="mt-3 divide-y divide-dashed divide-default text-sm">
                <template v-if="selectedDetail.source.submission_type === 'contact'">
                  <div v-if="selectedDetail.source.subject" class="grid gap-1 py-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <span class="text-dimmed">Subject</span>
                    <span class="min-w-0 break-words text-default sm:text-right">{{ selectedDetail.source.subject }}</span>
                  </div>
                  <div v-if="selectedDetail.source.location_title" class="grid gap-1 py-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <span class="text-dimmed">Location</span>
                    <span class="min-w-0 break-words text-default sm:text-right">{{ selectedDetail.source.location_title }}</span>
                  </div>
                  <div v-if="selectedDetail.source.experience_title" class="grid gap-1 py-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <span class="text-dimmed">Regarding</span>
                    <span class="min-w-0 break-words text-default sm:text-right">{{ selectedDetail.source.experience_title }}</span>
                  </div>
                  <div class="grid gap-1 py-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <span class="text-dimmed">Submitted</span>
                    <span class="min-w-0 break-words text-default sm:text-right">{{ formatDate(selectedDetail.source.created_at) }}</span>
                  </div>
                  <div class="grid gap-1 py-2">
                    <span class="text-dimmed">Message</span>
                    <p class="min-w-0 whitespace-pre-wrap break-words text-default">{{ selectedDetail.source.message }}</p>
                  </div>
                </template>
                <template v-else-if="selectedDetail.source.submission_type === 'reservation'">
                  <div class="grid gap-1 py-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <span class="text-dimmed">Location</span>
                    <span class="min-w-0 break-words text-default sm:text-right">{{ selectedDetail.source.location_title }}</span>
                  </div>
                  <div class="grid gap-1 py-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <span class="text-dimmed">Date</span>
                    <span class="min-w-0 break-words text-default sm:text-right">{{ selectedDetail.source.date }}</span>
                  </div>
                  <div class="grid gap-1 py-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <span class="text-dimmed">Time</span>
                    <span class="min-w-0 break-words text-default sm:text-right">{{ selectedDetail.source.time }}</span>
                  </div>
                  <div class="grid gap-1 py-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <span class="text-dimmed">Guests</span>
                    <span class="min-w-0 break-words text-default sm:text-right">{{ selectedDetail.source.guests }}</span>
                  </div>
                  <div class="grid gap-1 py-2">
                    <span class="text-dimmed">Requests</span>
                    <p class="min-w-0 whitespace-pre-wrap break-words text-default">{{ selectedDetail.source.requests || 'None' }}</p>
                  </div>
                </template>
                <template v-else>
                  <div class="grid gap-1 py-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <span class="text-dimmed">Location</span>
                    <span class="min-w-0 break-words text-default sm:text-right">{{ selectedDetail.source.location_title }}</span>
                  </div>
                  <div class="grid gap-1 py-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <span class="text-dimmed">Experience</span>
                    <span class="min-w-0 break-words text-default sm:text-right">{{ selectedDetail.source.experience_title }}</span>
                  </div>
                  <div class="grid gap-1 py-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <span class="text-dimmed">Date</span>
                    <span class="min-w-0 break-words text-default sm:text-right">{{ selectedDetail.source.booking_date }}</span>
                  </div>
                  <div class="grid gap-1 py-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <span class="text-dimmed">Time</span>
                    <span class="min-w-0 break-words text-default sm:text-right">{{ selectedDetail.source.time_slot }}</span>
                  </div>
                  <div class="grid gap-1 py-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
                    <span class="text-dimmed">Party size</span>
                    <span class="min-w-0 break-words text-default sm:text-right">{{ selectedDetail.source.party_size }}</span>
                  </div>
                  <div class="grid gap-1 py-2">
                    <span class="text-dimmed">Notes</span>
                    <p class="min-w-0 whitespace-pre-wrap break-words text-default">{{ selectedDetail.source.notes || 'None' }}</p>
                  </div>
                </template>
              </div>
            </UCard>

            <UCard class="border border-default shadow-none" :ui="{ body: 'p-4' }">
              <h3 class="text-sm font-semibold text-highlighted">Operational actions</h3>
              <p class="mt-1 text-xs text-muted">{{ operationalStatusLabel(selectedDetail.source.operational_status) }}</p>
              <div class="mt-3 grid gap-2">
                <template v-if="selectedDetail.source.submission_type === 'contact'">
                  <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-check" block @click="updateContactStatus('read')">Mark read</UButton>
                  <UButton size="sm" color="primary" variant="soft" icon="i-lucide-reply" block @click="updateContactStatus('replied')">Mark replied</UButton>
                </template>
                <template v-else-if="selectedDetail.source.submission_type === 'reservation'">
                  <UButton size="sm" color="success" variant="soft" icon="i-lucide-calendar-check" block @click="updateReservationStatus('confirmed')">Confirm</UButton>
                  <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-check" block @click="updateReservationStatus('completed')">Complete</UButton>
                  <UButton size="sm" color="error" variant="ghost" icon="i-lucide-x" block @click="updateReservationStatus('cancelled')">Cancel</UButton>
                </template>
                <template v-else>
                  <UButton size="sm" color="success" variant="soft" icon="i-lucide-calendar-check" block @click="updateBookingStatus('confirmed')">Confirm</UButton>
                  <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-check" block @click="completeBooking">Complete</UButton>
                  <UButton size="sm" color="error" variant="ghost" icon="i-lucide-x" block @click="updateBookingStatus('cancelled')">Cancel</UButton>
                </template>
              </div>
            </UCard>
          </div>
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import GuestThreadConversation from '~/components/conversation/GuestThreadConversation.vue'
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'

const props = defineProps<{
  scope: 'site' | 'location'
}>()

type SubmissionType = 'contact' | 'reservation' | 'experience_booking' | 'consultation' | 'appointment'
type InboxStatus = 'open' | 'waiting_on_owner' | 'waiting_on_guest' | 'closed'
type UiColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

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
    location_id: string | null
    location_title?: string | null
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
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
const selectedLocationId = computed(() => dashboardLocation.currentLocationId.value)
const isLocationScope = computed(() => props.scope === 'location')
const panelId = computed(() => props.scope === 'site' ? 'site-inbox' : 'location-inbox')
const navbarTitle = computed(() => props.scope === 'site' ? 'Site Inbox' : 'Location Inbox')
const locationVocabulary = computed(() => capabilities.value?.locationVocabulary ?? 'location')
const locationNoun = computed(() => locationVocabulary.value === 'office/service area' ? 'office/service area' : 'location')
const inboxDescription = computed(() => {
  const work = supportedThreadLabels.value.join(', ')
  if (props.scope === 'location') return `Guest work assigned to this ${locationNoun.value}.`
  return `Guest work across the site${work ? `: ${work}.` : '.'}`
})
const emptyDescription = computed(() => {
  const work = supportedThreadLabels.value.join(', ')
  if (props.scope === 'location') return `Assigned ${work || 'guest work'} for this ${locationNoun.value} will appear here.`
  return `New ${work || 'guest work'} will appear here.`
})
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
const typeFilter = ref<string>('')
const inboxStatusFilter = ref<string>('')
const unreadOnly = ref(false)
const selectedInboxStatus = ref<InboxStatus>('open')

const capabilities = computed(() => {
  const vertical = dashboard.site.value?.vertical
  if (!vertical) return null
  try {
    const normalizedVertical = normalizeVertical(vertical) as SiteVertical
    const template = resolvePublicTemplate({ vertical }).slug
    const location = props.scope === 'location'
      ? dashboard.locations.value.find(candidate => candidate.id === selectedLocationId.value) ?? null
      : null
    return resolveCmsCapabilities(normalizedVertical, template, {
      site: parseCmsFeatureOverrideDelta(dashboard.site.value?.feature_overrides),
      location: location ? parseCmsFeatureOverrideDelta(location.feature_overrides) : undefined,
    })
  } catch {
    return null
  }
})

const effectiveFeatureSet = computed(() => new Set<ProductFeature>([
  ...(capabilities.value?.pages.map(page => page.feature) ?? []),
  ...(capabilities.value?.managers.map(manager => manager.id) ?? []),
]))

const typeOptions = computed(() => {
  const options: Array<{ value: SubmissionType; label: string }> = [{ value: 'contact', label: 'Contact' }]
  if (effectiveFeatureSet.value.has('reservations')) options.push({ value: 'reservation', label: 'Reservations' })
  if (effectiveFeatureSet.value.has('experiences')) options.push({ value: 'experience_booking', label: 'Experience bookings' })
  return options
})

const supportedThreadLabels = computed(() => typeOptions.value.map(option => option.label.toLowerCase()))

let searchTimer: ReturnType<typeof setTimeout> | null = null

// Filter/search changes and the location-switch watcher below all call this
// without awaiting each other, so a slower earlier request can resolve after
// a newer one — the token makes a stale response a no-op instead of
// overwriting threads.value with results for a filter state that's no longer
// selected. Errors are handled here (not by callers) since most call sites
// fire-and-forget (`void loadThreads()`), which would otherwise produce an
// unhandled promise rejection instead of a visible toast.
let threadsRequestToken = 0
let detailRequestToken = 0

async function loadThreads() {
  if (isLocationScope.value && !selectedLocationId.value) return
  const requestToken = ++threadsRequestToken
  loadingThreads.value = true
  try {
    const res = await $fetch<{ threads: ThreadSummary[] }>(`/api/dashboard/sites/${siteId}/guest-threads`, {
      query: {
        location_id: isLocationScope.value ? selectedLocationId.value : undefined,
        search: search.value || undefined,
        type: typeFilter.value || undefined,
        inbox_status: inboxStatusFilter.value || undefined,
        unread: unreadOnly.value ? '1' : undefined,
      },
    })
    if (requestToken !== threadsRequestToken) return
    threads.value = res.threads ?? []
    await applyRouteSelection()
  } catch (error) {
    if (requestToken !== threadsRequestToken) return
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load inbox threads', color: 'error' })
  } finally {
    if (requestToken === threadsRequestToken) loadingThreads.value = false
  }
}

async function loadThreadDetail(threadId: string) {
  const requestToken = ++detailRequestToken
  loadingDetail.value = true
  selectedThreadId.value = null
  selectedDetail.value = null
  try {
    const res = await $fetch<ThreadDetailResponse>(`/api/dashboard/sites/${siteId}/guest-threads/${threadId}`)
    if (requestToken !== detailRequestToken) return false
    selectedThreadId.value = threadId
    selectedDetail.value = res
    selectedInboxStatus.value = res.thread.inbox_status
    replyDraft.value = ''
    return true
  } catch (error) {
    if (requestToken !== detailRequestToken) return false
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load thread', color: 'error' })
    return false
  } finally {
    if (requestToken === detailRequestToken) loadingDetail.value = false
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

function threadTypeLabel(type: SubmissionType) {
  if (type === 'contact') return 'Contact'
  if (type === 'reservation') return 'Reservation'
  if (type === 'experience_booking') return 'Experience booking'
  if (type === 'consultation') return 'Consultation'
  return 'Appointment'
}

function threadTypeIcon(type: SubmissionType) {
  if (type === 'contact') return 'i-lucide-mail'
  if (type === 'reservation') return 'i-lucide-calendar-days'
  if (type === 'experience_booking') return 'i-lucide-ticket'
  if (type === 'consultation') return 'i-lucide-message-circle-question'
  return 'i-lucide-calendar-clock'
}

function threadTypeColor(type: SubmissionType): UiColor {
  if (type === 'contact') return 'info'
  if (type === 'reservation') return 'success'
  if (type === 'experience_booking') return 'warning'
  return 'neutral'
}

function threadTypeIconClass(type: SubmissionType) {
  if (type === 'contact') return 'text-info'
  if (type === 'reservation') return 'text-success'
  if (type === 'experience_booking') return 'text-warning'
  return 'text-muted'
}

function threadStateLabel(status: InboxStatus) {
  if (status === 'waiting_on_owner') return 'Waiting on owner'
  if (status === 'waiting_on_guest') return 'Waiting on guest'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function threadStateColor(status: InboxStatus): UiColor {
  if (status === 'open') return 'info'
  if (status === 'waiting_on_owner') return 'warning'
  if (status === 'waiting_on_guest') return 'success'
  return 'neutral'
}

function operationalStatusLabel(status: string) {
  return status
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
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

watch(typeOptions, (options) => {
  if (typeFilter.value && !options.some(option => option.value === typeFilter.value)) {
    typeFilter.value = ''
  }
})

watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void loadThreads()
  }, 250)
})

watch(() => dashboardLocation.currentLocationId.value, async () => {
  if (!isLocationScope.value) return
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
  await loadThreads()
})
</script>
