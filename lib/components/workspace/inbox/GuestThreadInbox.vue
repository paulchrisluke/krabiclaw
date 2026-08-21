<template>
  <UDashboardPanel
    :id="panelId"
    :data-guest-thread-inbox-hydrated="inboxHydrated ? 'true' : 'false'"
  >
    <template #header>
      <UDashboardNavbar :title="navbarTitle">
        <template #leading>
          <DashboardNavbarLeading
            :detail-to="isDetailMode ? listRoute : null"
            detail-label="Inbox"
          />
        </template>

      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!isDetailMode" class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4">
        <div class="rounded-lg border border-default bg-default p-3 shadow-sm">
          <UInput
            v-model="search"
            type="search"
            icon="i-lucide-search"
            aria-label="Search guest threads"
            placeholder="Search guest, email..."
            class="w-full"
          />
        </div>

        <div class="overflow-hidden rounded-lg border border-default bg-default shadow-sm">
          <UAlert
            v-if="threadsError"
            color="error"
            variant="soft"
            title="Inbox could not be loaded"
            :description="getErrorMessage(threadsError, 'Guest inbox request failed')"
          />
          <NuxtLink
            v-for="thread in threads"
            :key="thread.id"
            :to="threadRoute(thread.id)"
            class="group flex items-start gap-3 border-b border-default px-4 py-4 transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div class="relative shrink-0">
              <div class="flex size-11 items-center justify-center rounded-full bg-elevated text-sm font-semibold text-highlighted ring-1 ring-default">
                {{ thread.guestName.charAt(0).toUpperCase() }}
              </div>
              <span v-if="thread.unread" class="absolute -right-0.5 -top-0.5 block size-2.5 rounded-full bg-primary ring-2 ring-default" />
            </div>

            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-3">
                <p class="truncate text-sm font-semibold text-highlighted">{{ thread.guestName }}</p>
                <span class="shrink-0 text-[11px] text-dimmed">{{ formatRelativeTime(thread.lastActivityAt) }}</span>
              </div>
              <p
                class="mt-1 line-clamp-2 text-sm"
                :class="thread.unread ? 'font-medium text-highlighted' : 'text-muted'"
              >
                {{ thread.preview?.text || 'New thread' }}
              </p>
              <p class="mt-1.5 truncate text-xs text-dimmed">{{ threadMetaLine(thread) }}</p>
            </div>
            <UIcon name="i-lucide-chevron-right" class="mt-3 size-4 shrink-0 text-dimmed transition group-hover:translate-x-0.5" />
          </NuxtLink>

          <div v-if="loadingThreads" class="space-y-2 p-4">
            <USkeleton v-for="i in 5" :key="i" class="h-16 rounded-lg" />
          </div>

          <div v-else-if="!threadsError && threads.length === 0" class="px-6 py-14 text-center">
            <UIcon name="i-lucide-inbox" class="mx-auto size-8 text-muted" />
            <p class="mt-3 text-sm font-medium text-highlighted">No guest threads yet</p>
            <p class="mt-1 text-xs text-muted">{{ emptyDescription }}</p>
          </div>
        </div>
      </div>

      <div v-else class="flex min-h-[calc(100vh-8rem)] w-full flex-1 flex-col">
        <div v-if="loadingDetail" class="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3">
          <USkeleton class="h-32 rounded-lg" />
          <USkeleton class="min-h-0 flex-1 rounded-lg" />
        </div>

        <div v-else-if="selectedDetail" class="min-h-0 flex-1">
          <section class="flex h-full min-h-[calc(100vh-8rem)] overflow-hidden border border-default bg-default shadow-sm sm:rounded-lg">
            <GuestThreadConversation
              v-model:input="replyDraft"
              :entries="conversationEntries"
              :submission-type="selectedDetail.submissionType"
              :guest-email="selectedDetail.guestEmail"
              :guest-phone="selectedDetail.guestPhone"
              :location-label="selectedDetail.locationLabel"
              :context-label="threadContextLine(selectedDetail)"
              :source-fields="selectedDetail.source.fields"
              :action-items="threadActionItems"
              :pending-action="activeActionPending"
              :loading="replySaving"
              :disabled="replySaving || !selectedDetail.guestEmail"
              :disabled-reason="!selectedDetail.guestEmail ? 'This guest has no email on file, so a reply cannot be sent.' : null"
              :retrying-delivery-id="retryingDeliveryId"
              empty-title="No replies yet"
              empty-description="Guest replies will appear here."
              @submit="sendReply"
              @action="runThreadAction"
              @retry-delivery="retryDelivery"
            />
          </section>
        </div>

        <UAlert
          v-else-if="detailError"
          color="error"
          variant="soft"
          title="Thread could not be loaded"
          :description="getErrorMessage(detailError, 'Guest thread request failed')"
        />
        <div v-else class="mx-auto w-full max-w-5xl rounded-lg border border-default bg-default px-6 py-14 text-center shadow-sm">
          <UIcon name="i-lucide-message-circle-off" class="mx-auto size-8 text-muted" />
          <p class="mt-3 text-sm font-medium text-highlighted">Thread not found</p>
          <UButton class="mt-4" color="neutral" variant="soft" icon="i-lucide-chevron-left" @click="goBackToList">
            Back to inbox
          </UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { getErrorMessage } from '~/utils/errors'
import GuestThreadConversation, { type GuestThreadEntryMessage } from '~/components/conversation/GuestThreadConversation.vue'
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'
import { useGuestInboxSocket, type GuestInboxSocketEvent } from '~/composables/useGuestInboxSocket'

const props = defineProps<{
  scope: 'organization' | 'site' | 'location'
  threadId?: string | null
  submissionTypeFilter?: 'contact' | 'reservation' | 'experience_booking'
}>()

type SubmissionType = 'contact' | 'reservation' | 'experience_booking'
type ConversationState = 'needs_attention' | 'waiting_on_guest' | 'resolved'
type UiColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

interface ThreadListItem {
  id: string
  guestName: string
  submissionType: SubmissionType
  contextLabel: string
  locationLabel: string | null
  conversationState: ConversationState
  conversationStateLabel: string
  operationalStatus: string | null
  operationalStatusLabel: string | null
  unread: boolean
  unreadCount: number
  preview: { kind: 'message' | 'submission'; text: string } | null
  lastActivityAt: string
  needsAttention: boolean
}

interface ThreadEntry {
  id: string
  kind: 'submission' | 'message' | 'operation' | 'delivery' | 'assignment' | 'resolution'
  actorKind: 'guest' | 'member' | 'system'
  actorUserId: string | null
  actorLabel: string | null
  channel: 'web' | 'email' | 'whatsapp' | 'system' | null
  body: string | null
  eventName: string | null
  payload: Record<string, unknown> | null
  sequence: number | null
  occurredAt: string
}

interface DeliveryFailure {
  id: string
  channel: 'email' | 'whatsapp'
  toAddress: string | null
  lastError: string | null
  attemptCount: number
  createdAt: string
}

interface ThreadDetail {
  id: string
  guestName: string
  guestEmail: string | null
  guestPhone: string | null
  submissionType: SubmissionType
  submissionId: string
  contextLabel: string
  locationLabel: string | null
  conversationState: ConversationState
  conversationStateLabel: string
  source: {
    submissionType: SubmissionType
    submissionId: string
    operationalStatus: string
    operationalStatusLabel: string
    fields: Record<string, unknown>
  }
  entries: ThreadEntry[]
  availableActions: string[]
  deliveryFailures: DeliveryFailure[]
  memberReadCursor: { lastReadEntryId: string | null; lastReadSequence: number }
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

const threadTypeMeta: Record<SubmissionType, { label: string; color: UiColor }> = {
  contact: { label: 'Contact', color: 'info' },
  reservation: { label: 'Reservation', color: 'success' },
  experience_booking: { label: 'Experience booking', color: 'warning' },
}

const ACTION_META: Record<string, { label: string; icon: string; color: UiColor; variant: 'soft' | 'outline' | 'ghost'; destructive?: boolean }> = {
  confirm: { label: 'Confirm', icon: 'i-lucide-calendar-check', color: 'success', variant: 'soft' },
  complete: { label: 'Complete', icon: 'i-lucide-check', color: 'neutral', variant: 'outline' },
  cancel: { label: 'Cancel', icon: 'i-lucide-x', color: 'error', variant: 'ghost', destructive: true },
}

const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
const { formatRelativeTime } = useHumanTime()

const siteId = computed(() => {
  if (isOrganizationScope.value) return null
  return dashboard.siteId.value
})
const toast = useToast()
const route = useRoute()
const router = useRouter()

const selectedLocationId = computed(() => dashboardLocation.currentLocationId.value)
const isLocationScope = computed(() => props.scope === 'location')
const isOrganizationScope = computed(() => props.scope === 'organization')
const isDetailMode = computed(() => Boolean(props.threadId))
const panelId = computed(() => {
  if (isOrganizationScope.value) return 'org-inbox'
  return props.scope === 'site' ? 'site-inbox' : 'location-inbox'
})
const navbarTitle = computed(() => {
  if (selectedDetail.value) return selectedDetail.value.guestName
  if (isDetailMode.value) return 'Conversation'
  if (isOrganizationScope.value) return 'Inbox'
  return props.scope === 'site' ? 'Site Inbox' : 'Location Inbox'
})
const listRoute = computed(() => {
  const orgSlug = String(route.params.orgSlug)
  if (isOrganizationScope.value) {
    return `/dashboard/${orgSlug}/inbox`
  }
  const siteSlug = String(route.params.siteSlug)
  if (isLocationScope.value) {
    return `/dashboard/${orgSlug}/sites/${siteSlug}/locations/${String(route.params.locationSlug)}/inbox`
  }
  return `/dashboard/${orgSlug}/sites/${siteSlug}/inbox`
})
const locationVocabulary = computed(() => capabilities.value?.locationVocabulary ?? 'location')
const locationNoun = computed(() => locationVocabulary.value === 'office/service area' ? 'office/service area' : 'location')
const emptyDescription = computed(() => {
  const work = supportedThreadLabels.value.join(', ')
  if (isOrganizationScope.value) return `New ${work || 'guest work'} across all sites will appear here.`
  if (props.scope === 'location') return `Assigned ${work || 'guest work'} for this ${locationNoun.value} will appear here.`
  return `New ${work || 'guest work'} will appear here.`
})

const loadingThreads = ref(false)
const loadingDetail = ref(false)
const inboxHydrated = ref(false)
const threadsError = ref<unknown>(null)
const detailError = ref<unknown>(null)
const threads = ref<ThreadListItem[]>([])
const selectedDetail = ref<ThreadDetail | null>(null)
const replyDraft = ref('')
const replySaving = ref(false)
const search = ref('')
const operationActionPending = ref<string | null>(null)
const retryingDeliveryId = ref<string | null>(null)
const replyAttemptKey = ref<string | null>(null)
const replyAttemptDraft = ref<string | null>(null)
const operationAttemptKeys = ref<Record<string, string>>({})
const retryAttemptKeys = ref<Record<string, string>>({})

const inboxSocket = useGuestInboxSocket({
  siteId: siteId.value ?? 'org',
  onEvent: (event: GuestInboxSocketEvent) => {
    if (siteId.value && event.siteId !== siteId.value) return
    if (isDetailMode.value && event.threadId === props.threadId) {
      void refreshThread(event.threadId)
    } else if (!isDetailMode.value) {
      void loadThreads()
    }
  },
  onReconnect: () => {
    if (isDetailMode.value && props.threadId) void refreshThread(props.threadId)
    else void loadThreads()
  },
})

onMounted(() => {
  inboxHydrated.value = true
  inboxSocket.connect()
})

const conversationEntries = computed<GuestThreadEntryMessage[]>(() => (selectedDetail.value?.entries ?? []).map(entry => ({
  ...entry,
  role: entry.actorKind,
})))
const threadActionItems = computed(() => {
  if (!selectedDetail.value) return []
  return selectedDetail.value.availableActions.map((action) => {
    const meta = actionMeta(action)
    return { value: action, label: meta.label, icon: meta.icon, color: meta.color, variant: meta.variant }
  })
})
const activeActionPending = computed(() => operationActionPending.value)

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

const dashboardScope = useDashboardRouteScope()
const dashboardApi = useDashboardApi(dashboardScope)
const requestEvent = useRequestEvent()
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
let threadsRequestToken = 0
let detailRequestToken = 0

type InitialInboxResource =
  | { mode: 'list'; threads: ThreadListItem[] }
  | { mode: 'detail'; thread: ThreadDetail }

const initialInboxKey = computed(() => [
  'dashboard-guest-inbox',
  siteId.value ?? 'org',
  props.scope,
  isLocationScope.value ? selectedLocationId.value ?? 'pending-location' : isOrganizationScope.value ? 'org' : 'site',
  props.threadId ?? 'list',
  props.submissionTypeFilter ?? 'all',
].join(':'))

const {
  data: initialInboxData,
  pending: initialInboxPending,
  error: initialInboxError,
} = await useAsyncData<InitialInboxResource>(initialInboxKey, async () => {
  if (isLocationScope.value && !selectedLocationId.value) {
    return { mode: 'list', threads: [] }
  }
  if (!dashboardScope.value) {
    throw createError({ statusCode: 400, statusMessage: 'Dashboard route scope is incomplete' })
  }
  if (import.meta.server) {
    if (!requestEvent) {
      throw createError({ statusCode: 500, statusMessage: 'Dashboard request event unavailable' })
    }
    const { loadDashboardGuestThread, loadDashboardGuestThreads, loadOrganizationGuestThreads } = await import(
      '~/server/utils/dashboard-guest-threads'
    )
    if (props.threadId) {
      if (!siteId.value) {
        throw createError({ statusCode: 400, statusMessage: 'Thread detail requires site scope' })
      }
      const result = await loadDashboardGuestThread(requestEvent, siteId.value, props.threadId)
      return { mode: 'detail', thread: result.thread as ThreadDetail }
    }
    if (isOrganizationScope.value) {
      const result = await loadOrganizationGuestThreads(requestEvent, {
        type: props.submissionTypeFilter ?? null,
      })
      return { mode: 'list', threads: result.threads as ThreadListItem[] }
    }
    if (!siteId.value) {
      throw createError({ statusCode: 400, statusMessage: 'Inbox requires site scope' })
    }
    const result = await loadDashboardGuestThreads(requestEvent, siteId.value, {
      locationId: isLocationScope.value ? selectedLocationId.value : null,
      type: props.submissionTypeFilter ?? null,
    })
    return { mode: 'list', threads: result.threads as ThreadListItem[] }
  }
  if (props.threadId) {
    if (!siteId.value) {
      throw createError({ statusCode: 400, statusMessage: 'Thread detail requires site scope' })
    }
    const result = await dashboardApi<{ thread: ThreadDetail }>(
      `/api/dashboard/sites/${siteId.value}/guest-threads/${props.threadId}`,
      { validate: isThreadDetailResponse },
    )
    return { mode: 'detail', thread: result.thread }
  }
  if (isOrganizationScope.value) {
    const result = await dashboardApi<{ threads: ThreadListItem[] }>(
      '/api/dashboard/guest-threads',
      {
        query: {
          type: props.submissionTypeFilter,
        },
        validate: isThreadListResponse,
      },
    )
    return { mode: 'list', threads: result.threads }
  }
  const result = await dashboardApi<{ threads: ThreadListItem[] }>(
    `/api/dashboard/sites/${siteId.value}/guest-threads`,
    {
      query: {
        location_id: isLocationScope.value ? selectedLocationId.value : undefined,
        type: props.submissionTypeFilter,
      },
      validate: isThreadListResponse,
    },
  )
  return { mode: 'list', threads: result.threads }
})

watch([initialInboxData, initialInboxPending, initialInboxError], ([data, pending, error]) => {
  if (isDetailMode.value) {
    loadingDetail.value = pending
    detailError.value = error
    selectedDetail.value = data?.mode === 'detail' ? data.thread : null
    if (data?.mode === 'detail') replyDraft.value = ''
    return
  }
  loadingThreads.value = pending
  threadsError.value = error
  threads.value = data?.mode === 'list' ? data.threads : []
}, { immediate: true })

function isThreadListResponse(value: unknown): value is { threads: ThreadListItem[] } {
  return isRecord(value)
    && Array.isArray(value.threads)
    && value.threads.every(thread =>
      isRecord(thread)
      && typeof thread.id === 'string'
      && typeof thread.guestName === 'string'
      && typeof thread.submissionType === 'string'
      && typeof thread.lastActivityAt === 'string',
    )
}

function isThreadDetailResponse(value: unknown): value is { thread: ThreadDetail } {
  return isRecord(value)
    && isRecord(value.thread)
    && typeof value.thread.id === 'string'
    && typeof value.thread.guestName === 'string'
    && Array.isArray(value.thread.entries)
    && Array.isArray(value.thread.availableActions)
}

const isThreadOperationResponse = isThreadDetailResponse

function actionMeta(action: string) {
  return ACTION_META[action] ?? { label: action.charAt(0).toUpperCase() + action.slice(1), icon: 'i-lucide-circle', color: 'neutral' as UiColor, variant: 'outline' as const }
}

function threadRoute(threadId: string) {
  return `${listRoute.value}/${encodeURIComponent(threadId)}`
}

function activeReplyAttemptKey() {
  replyAttemptKey.value ||= crypto.randomUUID()
  replyAttemptDraft.value = replyDraft.value
  return replyAttemptKey.value
}

function activeAttemptMapKey(keys: Ref<Record<string, string>>, name: string) {
  keys.value[name] ||= crypto.randomUUID()
  return keys.value[name]
}

function clearAttemptMapKey(keys: Ref<Record<string, string>>, name: string) {
  const { [name]: _completedAttempt, ...remaining } = keys.value
  keys.value = remaining
}

async function goBackToList() {
  await router.push(listRoute.value)
}

async function loadThreads() {
  if (isLocationScope.value && !selectedLocationId.value) return
  if (!dashboardScope.value) return
  const requestToken = ++threadsRequestToken
  loadingThreads.value = true
  threadsError.value = null
  try {
    let res
    if (isOrganizationScope.value) {
      res = await dashboardApi<{ threads: ThreadListItem[] }>('/api/dashboard/guest-threads', {
        query: {
          search: search.value || undefined,
          type: props.submissionTypeFilter,
        },
        validate: isThreadListResponse,
      })
    } else {
      res = await dashboardApi<{ threads: ThreadListItem[] }>(`/api/dashboard/sites/${siteId.value}/guest-threads`, {
        query: {
          location_id: isLocationScope.value ? selectedLocationId.value : undefined,
          search: search.value || undefined,
          type: props.submissionTypeFilter,
        },
        validate: isThreadListResponse,
      })
    }
    if (requestToken !== threadsRequestToken) return
    threads.value = res.threads ?? []
  } catch (error) {
    if (requestToken !== threadsRequestToken) return
    threadsError.value = error
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load inbox threads', color: 'error' })
  } finally {
    if (requestToken === threadsRequestToken) loadingThreads.value = false
  }
}

async function loadThreadDetail(threadId: string) {
  if (!dashboardScope.value) return
  const requestToken = ++detailRequestToken
  loadingDetail.value = true
  selectedDetail.value = null
  detailError.value = null
  try {
    const res = await dashboardApi<{ thread: ThreadDetail }>(`/api/dashboard/sites/${siteId.value}/guest-threads/${threadId}`, {
      validate: isThreadDetailResponse,
    })
    if (requestToken !== detailRequestToken) return
    selectedDetail.value = res.thread
    replyDraft.value = ''
  } catch (error) {
    if (requestToken !== detailRequestToken) return
    detailError.value = error
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load thread', color: 'error' })
  } finally {
    if (requestToken === detailRequestToken) loadingDetail.value = false
  }
}

async function refreshThread(threadId: string) {
  await loadThreadDetail(threadId)
}

async function sendReply() {
  if (!dashboardScope.value || !props.threadId || !replyDraft.value.trim()) return
  const idempotencyKey = activeReplyAttemptKey()
  replySaving.value = true
  try {
    await dashboardApi<{ thread: ThreadDetail }>(
      `/api/dashboard/sites/${siteId.value}/guest-threads/${props.threadId}/operations/reply`,
      {
      method: 'POST',
      body: { body: replyDraft.value, idempotencyKey },
      validate: isThreadOperationResponse,
      },
    )
    replyAttemptKey.value = null
    replyAttemptDraft.value = null
    toast.add({ description: 'Reply sent', color: 'success' })
    await refreshThread(props.threadId)
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to send reply', color: 'error' })
  } finally {
    replySaving.value = false
  }
}

async function runOperationalAction(action: string) {
  if (!dashboardScope.value || !selectedDetail.value) return
  const meta = actionMeta(action)
  if (meta.destructive && import.meta.client) {
    const confirmed = window.confirm(`${meta.label} this ${threadTypeLabel(selectedDetail.value.submissionType).toLowerCase()}? This cannot be undone.`)
    if (!confirmed) return
  }
  const threadId = selectedDetail.value.id
  const attemptName = `${threadId}:${action}`
  const idempotencyKey = activeAttemptMapKey(operationAttemptKeys, attemptName)
  operationActionPending.value = action
  try {
    await dashboardApi<{ thread: ThreadDetail }>(
      `/api/dashboard/sites/${siteId.value}/guest-threads/${threadId}/operations/${action}`,
      {
      method: 'POST',
      body: { idempotencyKey },
      validate: isThreadOperationResponse,
      },
    )
    clearAttemptMapKey(operationAttemptKeys, attemptName)
    toast.add({ description: `${meta.label} applied`, color: 'success' })
    await refreshThread(threadId)
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : `Failed to ${meta.label.toLowerCase()}`, color: 'error' })
  } finally {
    operationActionPending.value = null
  }
}

async function runThreadAction(action: string) {
  await runOperationalAction(action)
}

async function retryDelivery(deliveryId: string) {
  if (!dashboardScope.value || !selectedDetail.value) return
  const threadId = selectedDetail.value.id
  const attemptName = `${threadId}:${deliveryId}`
  const idempotencyKey = activeAttemptMapKey(retryAttemptKeys, attemptName)
  retryingDeliveryId.value = deliveryId
  try {
    await dashboardApi<{ thread: ThreadDetail }>(
      `/api/dashboard/sites/${siteId.value}/guest-threads/${threadId}/operations/retry_delivery`,
      {
      method: 'POST',
      body: { deliveryId, idempotencyKey },
      validate: isThreadOperationResponse,
      },
    )
    clearAttemptMapKey(retryAttemptKeys, attemptName)
    await refreshThread(threadId)
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Retry failed', color: 'error' })
  } finally {
    retryingDeliveryId.value = null
  }
}

function threadTypeLabel(type: SubmissionType) {
  return threadTypeMeta[type].label
}

function threadMetaLine(thread: ThreadListItem) {
  const parts: string[] = []
  if (!props.submissionTypeFilter) parts.push(threadTypeLabel(thread.submissionType))
  if (thread.locationLabel) parts.push(thread.locationLabel)
  return parts.join(' · ')
}

function threadContextLine(detail: ThreadDetail) {
  const parts: string[] = []
  if (!props.submissionTypeFilter) parts.push(threadTypeLabel(detail.submissionType))
  if (detail.locationLabel) parts.push(detail.locationLabel)
  return parts.join(' · ')
}

watch(search, () => {
  if (isDetailMode.value) return
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void loadThreads()
  }, 250)
})

watch(replyDraft, (draft) => {
  if (replyAttemptKey.value && replyAttemptDraft.value !== null && draft !== replyAttemptDraft.value) {
    replyAttemptKey.value = null
    replyAttemptDraft.value = null
  }
})

</script>
