<template>
  <div class="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
    <UAlert
      v-if="realtimeFailed"
      color="warning"
      variant="soft"
      icon="i-lucide-wifi-off"
      title="Live updates are unavailable"
      description="This conversation may be out of date until the dashboard reconnects."
      class="m-3"
    >
      <template #actions>
        <UButton color="warning" variant="soft" size="xs" :loading="loadingDetail" @click="refreshThreadState">
          Refresh
        </UButton>
      </template>
    </UAlert>

    <div v-if="loadingDetail" class="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <USkeleton class="h-20 rounded-lg" />
      <USkeleton class="min-h-0 flex-1 rounded-lg" />
    </div>

    <section v-else-if="detail" class="flex min-h-0 w-full min-w-0 flex-1 overflow-hidden">
      <GuestThreadConversation
        v-model:input="replyDraft"
        :entries="detail.entries"
        :delivery-failures="detail.deliveryFailures"
        :guest-name="detail.guestName"
        :record-noun="recordNoun"
        :opening-message="openingMessage"
        :announcement="announcement"
        :loading="replySaving"
        :disabled="replySaving || !detail.guestEmail"
        :disabled-reason="!detail.guestEmail ? 'This guest has no email on file, so a reply cannot be sent.' : null"
        :retrying-delivery-id="retryingDeliveryId"
        :error="actionError"
        empty-title="No replies yet"
        empty-description="Guest replies will appear here."
        @submit="sendReply"
        @retry-delivery="retryDelivery"
      />
    </section>

    <!-- A request that failed, or a conversation that is gone, is a state this
         surface shows rather than a blank column. -->
    <UAlert
      v-else
      class="m-3"
      color="error"
      variant="soft"
      :title="isNotFoundError(detailError) ? 'This conversation is no longer available' : 'Conversation could not be loaded'"
      :description="isNotFoundError(detailError) ? 'It may have been deleted, or the link is from another business.' : getErrorMessage(detailError, 'Guest thread request failed')"
    />
  </div>
</template>

<script setup lang="ts">
import { getErrorMessage, isNotFoundError } from '~/utils/errors'
import GuestThreadConversation from '~/components/conversation/GuestThreadConversation.vue'
import {
  isThreadDetailResponse,
  threadRecordTitle,
  type ThreadDetail,
} from '~/lib/components/workspace/messages/guest-thread-client'
import { useDashboardInvalidations } from '~/composables/useDashboardInvalidations'

/*
  One guest thread, and only that thread. The list is a separate level of the
  editor frame, so nothing here loads or renders it, and this component draws no
  panel or navbar of its own — the route parent owns that chrome, and the way
  into the record behind the thread sits in that chrome too.
*/
const props = defineProps<{
  threadId: string
}>()

const dashboard = useDashboardSite()
const actionError = ref<string | null>(null)

const siteId = computed(() => dashboard.siteId.value)

const loadingDetail = ref(false)
const detailError = ref<unknown>(null)
const detail = ref<ThreadDetail | null>(null)
const replyDraft = ref('')
const replySaving = ref(false)
const retryingDeliveryId = ref<string | null>(null)
const replyAttemptKey = ref<string | null>(null)
const replyAttemptDraft = ref<string | null>(null)
const retryAttemptKeys = ref<Record<string, string>>({})

const realtime = useDashboardInvalidations()
const realtimeFailed = computed(() => realtime.status.value === 'failed')

const dashboardScope = useDashboardRouteScope()
const dashboardApi = useDashboardApi(dashboardScope)

let detailRequestToken = 0

const threadIdRef = computed(() => props.threadId)
const {
  data: initialDetail,
  pending: initialDetailPending,
  error: initialDetailError,
} = await useGuestThread(threadIdRef)

watch([initialDetail, initialDetailPending, initialDetailError], ([data, pending, error]) => {
  loadingDetail.value = pending
  detailError.value = error
  detail.value = data?.thread ?? null
}, { immediate: true })

// The tenant's own word for the record.
const recordNoun = computed(() => detail.value
  ? threadRecordTitle(detail.value.submissionType, dashboard.site.value?.vertical ?? null).toLowerCase()
  : 'details')
// A contact thread's words are its `message`; a reservation or booking carries
// them as `notes`. Either way they are what the guest typed to start this.
const openingMessage = computed(() => {
  const fields = detail.value?.source.fields
  if (!fields) return null
  const text = fields.message ?? fields.notes
  return typeof text === 'string' && text.trim() ? text : null
})

/*
  What the platform says when a booking arrives: every fact the record carries
  except the guest's own note, which is their message and reads as one.
*/
const announcement = computed(() => {
  const thread = detail.value
  if (!thread || thread.submissionType === 'contact') return null
  const fields = thread.source.fields
  // `guests` is the party size alone ("6", or "6+" when it is a minimum), so it
  // needs its noun the way the list row's preview gives it one.
  const size = typeof fields.guests === 'string' && fields.guests.trim()
    ? `${fields.guests} ${fields.guests === '1' ? 'guest' : 'guests'}`
    : null
  const rows = [
    { label: 'When', value: fields.whenLabel },
    { label: 'Guests', value: size },
    { label: capitalize(recordNoun.value), value: fields.productTitle },
    { label: 'Location', value: fields.locationTitle ?? thread.locationLabel },
    { label: 'Email', value: thread.guestEmail },
    { label: 'Phone', value: thread.guestPhone },
  ].filter((row): row is { label: string, value: string } => typeof row.value === 'string' && row.value.trim().length > 0)

  return { title: `New ${recordNoun.value}`, rows }
})

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
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

/**
 * Reload the thread.
 *
 * `clearDraft` is only true after the member's own send: every other caller is
 * a refresh they did not ask for — a realtime event, a reconnect — and wiping a
 * half-typed reply because someone else did something is not acceptable.
 *
 * The result is written back into the shared `useGuestThread` entry, not just
 * into this component, or the conversation and the record beside it would be
 * reading two different versions of the same thread.
 */
async function loadThreadDetail(options: { clearDraft?: boolean } = {}) {
  if (!dashboardScope.value || !siteId.value) return
  const requestToken = ++detailRequestToken
  loadingDetail.value = true
  detailError.value = null
  try {
    const res = await dashboardApi<{ thread: ThreadDetail }>(
      `/api/dashboard/sites/${siteId.value}/guest-threads/${props.threadId}`,
      { validate: isThreadDetailResponse },
    )
    if (requestToken !== detailRequestToken) return
    initialDetail.value = res
    detail.value = res.thread
    if (options.clearDraft) replyDraft.value = ''
  } catch (error) {
    if (requestToken !== detailRequestToken) return
    detailError.value = error
  } finally {
    if (requestToken === detailRequestToken) loadingDetail.value = false
  }
}

function refreshThreadState() {
  realtime.connect()
  void loadThreadDetail()
}

async function sendReply() {
  if (!dashboardScope.value || !replyDraft.value.trim()) return
  const idempotencyKey = activeReplyAttemptKey()
  replySaving.value = true
  actionError.value = null
  try {
    await dashboardApi<{ thread: ThreadDetail }>(
      `/api/dashboard/sites/${siteId.value}/guest-threads/${props.threadId}/operations/reply`,
      {
        method: 'POST',
        body: { body: replyDraft.value, idempotencyKey },
        validate: isThreadDetailResponse,
      },
    )
    replyAttemptKey.value = null
    replyAttemptDraft.value = null
    await loadThreadDetail({ clearDraft: true })
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Failed to send reply'
  } finally {
    replySaving.value = false
  }
}

async function retryDelivery(deliveryId: string) {
  if (!dashboardScope.value || !detail.value) return
  const attemptName = `${props.threadId}:${deliveryId}`
  const idempotencyKey = activeAttemptMapKey(retryAttemptKeys, attemptName)
  retryingDeliveryId.value = deliveryId
  actionError.value = null
  try {
    await dashboardApi<{ thread: ThreadDetail }>(
      `/api/dashboard/sites/${siteId.value}/guest-threads/${props.threadId}/operations/retry_delivery`,
      {
        method: 'POST',
        body: { deliveryId, idempotencyKey },
        validate: isThreadDetailResponse,
      },
    )
    clearAttemptMapKey(retryAttemptKeys, attemptName)
    await loadThreadDetail()
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Retry failed'
  } finally {
    retryingDeliveryId.value = null
  }
}

watch(realtime.event, (event) => {
  if (!event || !('threadId' in event)) return
  if (siteId.value && event.siteId !== siteId.value) return
  if (event.threadId === props.threadId) void loadThreadDetail()
})

watch(realtime.connectionEpoch, (epoch) => {
  if (epoch > 0) refreshThreadState()
})

watch(replyDraft, (draft) => {
  if (replyAttemptKey.value && replyAttemptDraft.value !== null && draft !== replyAttemptDraft.value) {
    replyAttemptKey.value = null
    replyAttemptDraft.value = null
  }
})
</script>
