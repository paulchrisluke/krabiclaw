<template>
  <div
    class="flex min-h-0 w-full min-w-0 flex-1 flex-col"
    :data-guest-thread-list-hydrated="listHydrated ? 'true' : 'false'"
  >
    <!--
      The panel's own header. It holds still while the rows scroll under it,
      the way a mail list does: the title row, then search in place of it, then
      one row of filters that scrolls sideways rather than wrapping.
    -->
    <header class="shrink-0 border-b border-default px-4 pb-3 pt-4">
      <div class="flex items-center gap-2">
        <UInput
          v-if="searchOpen"
          v-model="search"
          type="search"
          icon="i-lucide-search"
          aria-label="Search"
          placeholder="Search all messages"
          autofocus
          class="flex-1"
        />
        <!-- 22px/500, measured on Airbnb's own panel heading. -->
        <h1 class="min-w-0 flex-1 truncate text-[22px] font-medium text-highlighted">
          {{ pastOnly ? 'Past conversations' : 'Messages' }}
        </h1>

        <UButton
          v-if="searchOpen"
          color="neutral"
          variant="ghost"
          size="sm"
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
        Airbnb's own control: the kind is a dropdown labelled by what is
        selected, and Unread sits beside it as a toggle. Both are 40px pills.
      -->
      <div class="mt-3 flex items-center gap-2">
        <UDropdownMenu
          :items="typeMenuItems"
          :content="{ align: 'start' }"
          :ui="{
            content: 'min-w-72 p-2',
            item: 'px-3 py-3 text-base gap-4',
            itemLeadingIcon: 'size-6',
          }"
        >
          <!--
            The trigger names the control, not the selection. Measured on
            Airbnb: text "All", aria-label "All, filter by message type",
            71x40 at 32px radius, 14px/400 — it reads "All" whichever option
            is checked, and the menu carries the tick.
          -->
          <UButton
            color="neutral"
            :variant="activeType ? 'solid' : 'outline'"
            class="h-10 rounded-full px-4 text-sm font-normal"
            trailing-icon="i-lucide-chevron-down"
            aria-label="All, filter by message type"
          >
            All
          </UButton>
        </UDropdownMenu>

        <UButton
          class="h-10 rounded-full px-4 text-sm font-normal"
          color="neutral"
          :variant="unreadOnly ? 'solid' : 'outline'"
          :aria-pressed="unreadOnly"
          @click="setQuery({ unread: unreadOnly ? undefined : '1' })"
        >
          Unread
        </UButton>
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <UAlert
        v-if="realtimeFailed"
        color="warning"
        variant="soft"
        icon="i-lucide-wifi-off"
        title="Live updates are unavailable"
        description="This list may be out of date until the dashboard reconnects."
        class="m-3"
      >
        <template #actions>
          <UButton color="warning" variant="soft" size="xs" :loading="loadingThreads" @click="refreshThreads">
            Refresh
          </UButton>
        </template>
      </UAlert>

      <UAlert
        v-if="threadsError"
        color="error"
        variant="soft"
        class="m-3"
        title="Messages could not be loaded"
        :description="getErrorMessage(threadsError, 'Guest thread request failed')"
      />

      <!--
        Rows run to the edge of the panel. A bordered card around the list put
        32px of gutter between the picture and the pane and made every row
        narrower than the text it holds.
      -->
      <NuxtLink
        v-for="thread in threads"
        :key="thread.id"
        :to="{ path: threadRoute(thread), query: route.query }"
        class="mx-3 flex items-start gap-3 rounded-xl px-3 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        :class="thread.id === openThreadId ? 'bg-elevated' : 'hover:bg-elevated/60'"
      >
        <!-- The picture leads. A thread whose location has no hero keeps the
             same footprint so the rows do not reflow between them. -->
        <img
          v-if="thread.imageUrl"
          :src="thread.imageUrl"
          alt=""
          class="size-14 shrink-0 rounded-xl object-cover"
          loading="lazy"
        >
        <div v-else class="flex size-14 shrink-0 items-center justify-center rounded-xl bg-elevated">
          <UIcon name="i-lucide-image" class="size-5 text-dimmed" />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-3 text-xs text-muted">
            <span class="truncate">{{ occurrenceLine(thread) }}</span>
            <span class="shrink-0">{{ formatRelativeTime(thread.lastActivityAt) }}</span>
          </div>
          <p class="mt-0.5 truncate text-sm font-medium text-highlighted">{{ thread.guestName }}</p>
          <p class="mt-0.5 line-clamp-2 text-sm leading-snug text-muted">{{ thread.preview?.text || 'New conversation' }}</p>
        </div>

        <span
          v-if="thread.unread"
          class="mt-2 block size-2.5 shrink-0 rounded-full bg-primary"
          :aria-label="`${thread.guestName}: unread`"
        />
      </NuxtLink>

      <!--
        Airbnb's own: a 50px full-bleed row at the foot of the list, not a tab
        beside it. Past conversations are a different place you go to, not a
        lens on the one you are in.
      -->
      <NuxtLink
        v-if="!loadingThreads && !pastOnly && threads.length > 0"
        :to="{ path: listRoute, query: { ...route.query, past: '1' } }"
        class="mt-2 flex items-center justify-between gap-3 border-t border-default px-4 py-4 text-sm font-medium text-default transition hover:bg-elevated/60"
      >
        <span>Past conversations</span>
        <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
      </NuxtLink>

      <div v-if="loadingThreads" class="space-y-3 p-4">
        <USkeleton v-for="i in 5" :key="i" class="h-14 rounded-xl" />
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
  /** Rendered somewhere other than the messages screen: it opens nothing on its own. */
  embedded?: boolean
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
const unreadOnly = computed(() => route.query.unread === '1')
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

const typeMenuItems = computed(() => [typeOptions.value.map(option => ({
  label: option.label,
  icon: option.icon,
  type: 'checkbox' as const,
  checked: activeType.value === option.value,
  onSelect: () => setQuery({ filter: option.value ?? undefined }),
  ui: { itemLabel: 'text-base' },
}))])

const filtersApplied = computed(() => Boolean(route.query.query || route.query.filter || route.query.unread))

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
    { value: null, label: 'All', icon: 'i-lucide-message-square' },
    ...kinds.map(kind => ({
      value: kind,
      label: threadFilterLabel(kind, vertical.value),
      icon: kind === 'reservation' ? 'i-lucide-utensils' : 'i-lucide-ticket',
    })),
    { value: 'contact' as const, label: threadFilterLabel('contact', vertical.value), icon: 'i-lucide-mail' },
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
  unread: unreadOnly.value ? '1' as const : undefined,
}))

const initialThreadsKey = computed(() => [
  'dashboard-guest-threads',
  siteId.value ?? 'org',
  props.scope,
  isLocationScope.value ? selectedLocationId.value ?? 'pending-location' : isOrganizationScope.value ? 'org' : 'site',
  activeType.value ?? 'all',
  pastOnly.value ? 'past' : 'current',
  unreadOnly.value ? 'unread' : 'any',
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
        unreadOnly: unreadOnly.value,
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
      unreadOnly: unreadOnly.value,
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

/*
  The list never sits beside an EMPTY column — but only where there is a column
  beside it. Airbnb's /hosting/messages opens its newest thread on a wide
  screen; below `lg` the list is the whole screen and the thread is somewhere
  you go, so opening one on arrival would bounce the member straight back out
  of the list they just closed a thread to reach.
*/
const pairedColumns = ref(false)
onMounted(() => {
  const query = window.matchMedia('(min-width: 64rem)')
  pairedColumns.value = query.matches
  const sync = (event: MediaQueryListEvent) => { pairedColumns.value = event.matches }
  query.addEventListener('change', sync)
  onBeforeUnmount(() => query.removeEventListener('change', sync))
})

watch([threads, openThreadId, pairedColumns], ([rows, open, paired]) => {
  if (!paired || open || isOrganizationScope.value || props.embedded) return
  const first = rows[0]
  if (!first) return
  void router.replace({ path: threadRoute(first), query: route.query })
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

watch([activeType, pastOnly, unreadOnly], () => {
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
