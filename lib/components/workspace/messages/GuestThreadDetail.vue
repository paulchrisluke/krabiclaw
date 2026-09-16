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
        :record-to="recordTo"
        :subline="subline"
        :loading="replySaving"
        :disabled="replySaving || !detail.guestEmail"
        :disabled-reason="!detail.guestEmail ? 'This guest has no email on file, so a reply cannot be sent.' : null"
        :retrying-delivery-id="retryingDeliveryId"
        empty-title="No replies yet"
        empty-description="Guest replies will appear here."
        @submit="sendReply"
        @retry-delivery="retryDelivery"
      />
    </section>

    <!-- A request that failed is a state this surface shows; the record may well
         still be there. A record that is not there 404s in the page instead. -->
    <UAlert
      v-else
      class="m-3"
      color="error"
      variant="soft"
      title="Conversation could not be loaded"
      :description="getErrorMessage(detailError, 'Guest thread request failed')"
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
  panel or navbar of its own — the route parent owns that chrome. The record
  behind the thread is a level of its own too: this links to it and does not
  draw it.
*/
const props = defineProps<{
  threadId: string
  /** Where this thread lives in the URL. The record hangs off it. */
  threadPath: string
}>()

const dashboard = useDashboardSite()
const toast = useToast()

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

// A thread that is not there is not a page. Capability gating and missing
// records 404 rather than rendering an editor frame around nothing.
if (initialDetailError.value && isNotFoundError(initialDetailError.value)) {
  throw createError({ statusCode: 404, statusMessage: 'Guest thread not found' })
}

watch([initialDetail, initialDetailPending, initialDetailError], ([data, pending, error]) => {
  loadingDetail.value = pending
  detailError.value = error
  detail.value = data?.thread ?? null
  if (data?.thread) replyDraft.value = ''
}, { immediate: true })

// The tenant's own word for the record, and the route it is read at. A contact
// thread has no record, so it offers no way to one.
const recordNoun = computed(() => detail.value
  ? threadRecordTitle(detail.value.submissionType, dashboard.site.value?.vertical ?? null).toLowerCase()
  : 'details')
const recordTo = computed(() => {
  if (!detail.value || detail.value.submissionType === 'contact') return null
  return `${props.threadPath}/details`
})
const subline = computed(() => {
  if (!detail.value) return null
  return [detail.value.locationLabel, detail.value.guestEmail].filter(Boolean).join(' · ') || null
})

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

async function loadThreadDetail() {
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
    detail.value = res.thread
    replyDraft.value = ''
  } catch (error) {
    if (requestToken !== detailRequestToken) return
    detailError.value = error
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load conversation', color: 'error' })
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
  try {
    let accepted = false
    await dashboardApi<{ thread: ThreadDetail }>(
      `/api/dashboard/sites/${siteId.value}/guest-threads/${props.threadId}/operations/reply`,
      {
        method: 'POST',
        body: { body: replyDraft.value, idempotencyKey },
        validate: isThreadDetailResponse,
        onResponse: ({ response }) => { accepted = response.status === 202 },
      },
    )
    replyAttemptKey.value = null
    replyAttemptDraft.value = null
    toast.add({ description: accepted ? 'Reply delivery is in progress' : 'Reply sent', color: accepted ? 'info' : 'success' })
    await loadThreadDetail()
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Failed to send reply', color: 'error' })
  } finally {
    replySaving.value = false
  }
}

async function retryDelivery(deliveryId: string) {
  if (!dashboardScope.value || !detail.value) return
  const attemptName = `${props.threadId}:${deliveryId}`
  const idempotencyKey = activeAttemptMapKey(retryAttemptKeys, attemptName)
  retryingDeliveryId.value = deliveryId
  try {
    let accepted = false
    await dashboardApi<{ thread: ThreadDetail }>(
      `/api/dashboard/sites/${siteId.value}/guest-threads/${props.threadId}/operations/retry_delivery`,
      {
        method: 'POST',
        body: { deliveryId, idempotencyKey },
        validate: isThreadDetailResponse,
        onResponse: ({ response }) => { accepted = response.status === 202 },
      },
    )
    clearAttemptMapKey(retryAttemptKeys, attemptName)
    toast.add({ description: accepted ? 'Delivery retry is in progress' : 'Delivery retried', color: accepted ? 'info' : 'success' })
  } catch (error) {
    toast.add({ description: error instanceof Error ? error.message : 'Retry failed', color: 'error' })
  } finally {
    retryingDeliveryId.value = null
  }
  await loadThreadDetail()
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
