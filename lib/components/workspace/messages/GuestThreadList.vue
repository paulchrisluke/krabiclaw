<template>
  <div
    class="mx-auto flex w-full max-w-5xl flex-1 flex-col"
    :data-guest-thread-list-hydrated="listHydrated ? 'true' : 'false'"
  >
    <UAlert
      v-if="realtimeFailed"
      color="warning"
      variant="soft"
      icon="i-lucide-wifi-off"
      title="Live updates are unavailable"
      description="This list may be out of date until the dashboard reconnects."
      class="mb-4"
    >
      <template #actions>
        <UButton color="warning" variant="soft" size="xs" :loading="loadingThreads" @click="refreshThreads">
          Refresh
        </UButton>
      </template>
    </UAlert>

    <!--
      Search opens in place and keeps the filters visible, so what is being
      searched stays legible. Every part of it is in the query string, so a
      filtered list is a link someone can send.
    -->
    <div class="mb-3 flex items-center gap-2">
      <UInput
        v-if="searchOpen"
        ref="searchInput"
        v-model="search"
        type="search"
        icon="i-lucide-search"
        aria-label="Search"
        placeholder="Search all messages"
        autofocus
        class="flex-1"
      />
      <h1 v-else class="flex-1 text-xl font-semibold text-highlighted">{{ pastOnly ? 'Past conversations' : 'Messages' }}</h1>

      <UButton
        v-if="searchOpen"
        color="neutral"
        variant="ghost"
        label="Cancel"
        @click="closeSearch"
      />
      <UButton
        v-else
        color="neutral"
        variant="ghost"
        icon="i-lucide-search"
        aria-label="Search"
        @click="searchOpen = true"
      />
    </div>

    <!--
      Two corpora, named the same way the URL names them. Airbnb hides its past
      conversations behind the last row of the list and has to repeat the link
      in two other places to make it findable; this says it once, here.
    -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <UButton
        v-for="option in occurrenceOptions"
        :key="option.value"
        size="sm"
        class="rounded-full"
        :color="pastOnly === option.past ? 'primary' : 'neutral'"
        :variant="pastOnly === option.past ? 'solid' : 'outline'"
        :aria-pressed="pastOnly === option.past"
        @click="setQuery({ past: option.past ? '1' : undefined })"
      >
        {{ option.label }}
      </UButton>

      <USeparator v-if="typeOptions.length > 1" orientation="vertical" class="mx-1 h-5" />

      <UButton
        v-for="option in typeOptions"
        :key="option.value ?? 'all'"
        size="sm"
        class="rounded-full"
        :color="activeType === option.value ? 'primary' : 'neutral'"
        :variant="activeType === option.value ? 'solid' : 'outline'"
        :aria-pressed="activeType === option.value"
        @click="setQuery({ filter: option.value ?? undefined })"
      >
        {{ option.label }}
      </UButton>
    </div>

    <div class="overflow-hidden rounded-lg border border-default bg-default shadow-sm">
      <UAlert
        v-if="threadsError"
        color="error"
        variant="soft"
        title="Messages could not be loaded"
        :description="getErrorMessage(threadsError, 'Guest thread request failed')"
      />

      <NuxtLink
        v-for="thread in threads"
        :key="thread.id"
        :to="threadRoute(thread)"
        class="flex items-start gap-3 px-3 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        :class="thread.id === openThreadId ? 'bg-elevated' : 'hover:bg-muted/50'"
      >
        <!-- The picture leads. A thread whose location has no hero keeps the
             same footprint so the rows do not reflow between them. -->
        <img
          v-if="thread.imageUrl"
          :src="thread.imageUrl"
          alt=""
          class="size-15 shrink-0 rounded-xl object-cover"
          loading="lazy"
        >
        <div v-else class="flex size-15 shrink-0 items-center justify-center rounded-xl bg-elevated">
          <UIcon name="i-lucide-image" class="size-5 text-dimmed" />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-3 text-xs text-muted">
            <span class="truncate">{{ occurrenceLine(thread) }}</span>
            <span class="shrink-0">{{ formatRelativeTime(thread.lastActivityAt) }}</span>
          </div>
          <p class="mt-0.5 truncate text-sm font-medium text-highlighted">{{ thread.guestName }}</p>
          <p class="mt-0.5 line-clamp-2 text-sm text-muted">{{ thread.preview?.text || 'New conversation' }}</p>
        </div>

        <span
          v-if="thread.unread"
          class="mt-2 block size-2.5 shrink-0 rounded-full bg-primary"
          :aria-label="`${thread.guestName}: unread`"
        />
      </NuxtLink>

      <div v-if="loadingThreads" class="space-y-2 p-4">
        <USkeleton v-for="i in 5" :key="i" class="h-16 rounded-lg" />
      </div>

      <div v-else-if="!threadsError && threads.length === 0" class="px-6 py-14 text-center">
        <p class="text-base font-medium text-highlighted">{{ emptyTitle }}</p>
        <p class="mt-1 text-sm text-muted">{{ emptyDescription }}</p>
        <UButton
          v-if="filtersApplied"
          class="mt-5"
          color="neutral"
          variant="outline"
          label="Clear all filters"
          @click="clearFilters"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getErrorMessage } from '~/utils/errors'
import {
  isThreadListResponse,
  threadFilterLabel,
  type SubmissionType,
  type ThreadListItem,
} from '~/lib/components/workspace/messages/guest-thread-client'
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities, type ProductFeature } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'
import { useDashboardInvalidations } from '~/composables/useDashboardInvalidations'

/*
  The thread list, and only the list. A thread opens as this level's detail
  column through the editor frame, so nothing here fetches, renders or mutates
  a conversation, and this component draws no panel or navbar of its own — the
  route parent owns that chrome.
*/
const props = defineProps<{
  scope: 'organization' | 'site' | 'location'
  /** Locks the list to one kind, for a surface that is only ever about that kind. */
  submissionTypeFilter?: SubmissionType
}>()

const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
const { formatRelativeTime } = useHumanTime()

const toast = useToast()
const route = useRoute()
const router = useRouter()

const isLocationScope = computed(() => props.scope === 'location')
const isOrganizationScope = computed(() => props.scope === 'organization')
const selectedLocationId = computed(() => dashboardLocation.currentLocationId.value)
const siteId = computed(() => isOrganizationScope.value ? null : dashboard.siteId.value)

const listRoute = computed(() => {
  const orgSlug = String(route.params.orgSlug)
  if (isOrganizationScope.value) return `/dashboard/${orgSlug}/messages`
  const siteSlug = String(route.params.siteSlug)
  if (isLocationScope.value) {
    return `/dashboard/${orgSlug}/sites/${siteSlug}/locations/${String(route.params.locationSlug)}/messages`
  }
  return `/dashboard/${orgSlug}/sites/${siteSlug}/messages`
})

// The open thread, for the selected row. It is the segment below this list, so
// it is read from the route rather than tracked as state of its own.
const openThreadId = computed(() => {
  if (!route.path.startsWith(`${listRoute.value}/`)) return null
  return decodeURIComponent(route.path.slice(listRoute.value.length + 1).split('/')[0] ?? '') || null
})

// Filter, search and corpus live in the URL, so a filtered list is a link.
const pastOnly = computed(() => route.query.past === '1')
const activeType = computed<SubmissionType | null>(() => {
  if (props.submissionTypeFilter) return props.submissionTypeFilter
  const value = route.query.filter
  return value === 'contact' || value === 'reservation' || value === 'booking' ? value : null
})
const search = computed({
  get: () => typeof route.query.query === 'string' ? route.query.query : '',
  set: value => setQuery({ query: value || undefined }),
})
const searchOpen = ref(Boolean(route.query.query))

function setQuery(patch: Record<string, string | undefined>) {
  void router.replace({ path: route.path, query: { ...route.query, ...patch } })
}

function closeSearch() {
  searchOpen.value = false
  setQuery({ query: undefined })
}

function clearFilters() {
  void router.replace({ path: route.path, query: {} })
  searchOpen.value = false
}

const filtersApplied = computed(() => Boolean(route.query.query || route.query.filter || route.query.past))

const occurrenceOptions = [
  { value: 'upcoming', label: 'Current', past: false },
  { value: 'past', label: 'Past', past: true },
] as const

const loadingThreads = ref(false)
const listHydrated = ref(false)
const threadsError = ref<unknown>(null)
const threads = ref<ThreadListItem[]>([])

const realtime = useDashboardInvalidations()
const realtimeFailed = computed(() => realtime.status.value === 'failed')

onMounted(() => {
  listHydrated.value = true
})

const capabilities = computed(() => {
  const vertical = dashboard.site.value?.vertical
  if (!vertical) return null
  try {
    const normalizedVertical = normalizeVertical(vertical) as SiteVertical
    const template = resolvePublicTemplate({ themeId: dashboard.site.value?.theme_id, vertical }).slug
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

/*
  What this tenant can be written to about, named the way the tenant names it.
  Airbnb's pills are Homes and Experiences — what was booked, not what kind of
  record it made — so these come from the product and booking vocabularies
  rather than a list of schema words kept here.
*/
const vertical = computed(() => dashboard.site.value?.vertical ?? null)
const typeOptions = computed(() => {
  if (props.submissionTypeFilter) return []
  const kinds: SubmissionType[] = []
  if (effectiveFeatureSet.value.has('reservations')) kinds.push('reservation')
  if (effectiveFeatureSet.value.has('products')) kinds.push('booking')
  if (kinds.length === 0) return []
  return [
    { value: null, label: 'All' },
    ...kinds.map(kind => ({ value: kind, label: threadFilterLabel(kind, vertical.value) })),
    { value: 'contact' as const, label: threadFilterLabel('contact', vertical.value) },
  ]
})

const locationVocabulary = computed(() => capabilities.value?.locationVocabulary ?? 'location')
const locationNoun = computed(() => locationVocabulary.value === 'office/service area' ? 'office/service area' : 'location')
const emptyTitle = computed(() => {
  if (filtersApplied.value) return 'No conversations match'
  return pastOnly.value ? 'Nothing here yet' : 'No conversations yet'
})
const emptyDescription = computed(() => {
  if (route.query.query) return `Nothing matched “${route.query.query}”.`
  if (filtersApplied.value) return 'Try a different filter, or clear them to see everything.'
  if (pastOnly.value) return 'Conversations move here once their booking has passed.'
  if (isOrganizationScope.value) return 'New guest conversations across all sites will appear here.'
  if (props.scope === 'location') return `Conversations assigned to this ${locationNoun.value} will appear here.`
  return 'New guest conversations will appear here.'
})

let searchTimer: ReturnType<typeof setTimeout> | null = null
let threadsRequestToken = 0

const listQuery = computed(() => ({
  search: typeof route.query.query === 'string' && route.query.query ? route.query.query : undefined,
  type: activeType.value ?? undefined,
  occurrence: pastOnly.value ? 'past' as const : 'upcoming' as const,
}))

const initialThreadsKey = computed(() => [
  'dashboard-guest-threads',
  siteId.value ?? 'org',
  props.scope,
  isLocationScope.value ? selectedLocationId.value ?? 'pending-location' : isOrganizationScope.value ? 'org' : 'site',
  activeType.value ?? 'all',
  pastOnly.value ? 'past' : 'current',
].join(':'))

const {
  data: initialThreads,
  pending: initialThreadsPending,
  error: initialThreadsError,
} = await useAsyncData<{ threads: ThreadListItem[] }>(initialThreadsKey, async () => {
  if (isLocationScope.value && !selectedLocationId.value) {
    return { threads: [] }
  }
  if (!dashboardScope.value) {
    throw createError({ statusCode: 400, statusMessage: 'Dashboard route scope is incomplete' })
  }
  if (import.meta.server) {
    if (!requestEvent) {
      throw createError({ statusCode: 500, statusMessage: 'Dashboard request event unavailable' })
    }
    const { loadDashboardGuestThreads, loadOrganizationGuestThreads } = await import(
      '~/server/utils/dashboard-guest-threads'
    )
    if (isOrganizationScope.value) {
      const result = await loadOrganizationGuestThreads(requestEvent, {
        type: activeType.value,
        occurrence: listQuery.value.occurrence,
      }, {
        orgSlug: dashboardScope.value.orgSlug,
      })
      return { threads: result.threads as ThreadListItem[] }
    }
    if (!siteId.value) {
      throw createError({ statusCode: 400, statusMessage: 'Messages requires site scope' })
    }
    const result = await loadDashboardGuestThreads(requestEvent, siteId.value, {
      locationId: isLocationScope.value ? selectedLocationId.value : null,
      type: activeType.value,
      occurrence: listQuery.value.occurrence,
    })
    return { threads: result.threads as ThreadListItem[] }
  }
  if (isOrganizationScope.value) {
    return await dashboardApi<{ threads: ThreadListItem[] }>('/api/dashboard/guest-threads', {
      query: listQuery.value,
      validate: isThreadListResponse,
    })
  }
  return await dashboardApi<{ threads: ThreadListItem[] }>(
    `/api/dashboard/sites/${siteId.value}/guest-threads`,
    {
      query: {
        location_id: isLocationScope.value ? selectedLocationId.value : undefined,
        ...listQuery.value,
      },
      validate: isThreadListResponse,
    },
  )
})

watch([initialThreads, initialThreadsPending, initialThreadsError], ([data, pending, error]) => {
  loadingThreads.value = pending
  threadsError.value = error
  threads.value = data?.threads ?? []
}, { immediate: true })

// A thread belongs to a site, and every read and mutation for one is
// site-scoped, so the organization index re-roots into the owning site's
// messages. Within a site or location the thread opens beside this list.
function threadRoute(thread: ThreadListItem) {
  if (!isOrganizationScope.value) return `${listRoute.value}/${encodeURIComponent(thread.id)}`
  if (!thread.siteSlug) throw createError({ statusCode: 500, statusMessage: 'Thread site route is unavailable' })
  const orgSlug = encodeURIComponent(String(route.params.orgSlug))
  return `/dashboard/${orgSlug}/sites/${encodeURIComponent(thread.siteSlug)}/messages/${encodeURIComponent(thread.id)}`
}

/**
 * The line the row leads with: when the booking happens, formatted once on the
 * server in the record's own timezone. A thread with no booking says where it
 * came from instead.
 */
function occurrenceLine(thread: ThreadListItem) {
  if (thread.whenLabel) return thread.whenLabel
  return (isOrganizationScope.value ? thread.contextLabel : thread.locationLabel) ?? ''
}

async function loadThreads() {
  if (isLocationScope.value && !selectedLocationId.value) return
  if (!dashboardScope.value) return
  const requestToken = ++threadsRequestToken
  loadingThreads.value = true
  threadsError.value = null
  try {
    const res = isOrganizationScope.value
      ? await dashboardApi<{ threads: ThreadListItem[] }>('/api/dashboard/guest-threads', {
        query: listQuery.value,
        validate: isThreadListResponse,
      })
      : await dashboardApi<{ threads: ThreadListItem[] }>(`/api/dashboard/sites/${siteId.value}/guest-threads`, {
        query: {
          location_id: isLocationScope.value ? selectedLocationId.value : undefined,
          ...listQuery.value,
        },
        validate: isThreadListResponse,
      })
    if (requestToken !== threadsRequestToken) return
    threads.value = res.threads ?? []
  } catch (error) {
    if (requestToken !== threadsRequestToken) return
    threadsError.value = error
    toast.add({ description: error instanceof Error ? error.message : 'Failed to load conversations', color: 'error' })
  } finally {
    if (requestToken === threadsRequestToken) loadingThreads.value = false
  }
}

function refreshThreads() {
  realtime.connect()
  void loadThreads()
}

watch(() => route.query.query, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void loadThreads()
  }, 250)
})

watch([activeType, pastOnly], () => {
  void loadThreads()
})

watch(realtime.event, (event) => {
  if (!event || !('threadId' in event)) return
  if (siteId.value && event.siteId !== siteId.value) return
  void loadThreads()
})

watch(realtime.connectionEpoch, (epoch) => {
  if (epoch > 0) refreshThreads()
})
</script>
