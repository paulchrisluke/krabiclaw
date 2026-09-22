<template>
  <div
    class="flex min-h-0 w-full min-w-0 flex-1 flex-col"
    :data-guest-thread-list-hydrated="listHydrated ? 'true' : 'false'"
  >
    <!--
      The list's controls. The title is the navbar's, like every other screen;
      this row holds the filters, with search at its end. Search is the
      dashboard's one search, opened from here the way it opens from the Menu.
    -->
    <header class="shrink-0 px-4 py-3">
      <!--
        Airbnb's own control: the kind is a dropdown labelled by what is
        selected, and Unread sits beside it as a toggle. Both are 40px pills.
      -->
      <div class="flex items-center gap-2">
        <UDropdownMenu
          v-if="typeOptions.length"
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
        <!-- The picture leads: the location's hero, or the business's logo for
             a thread that came to the business itself. A place with neither
             keeps the same footprint so the rows do not reflow between them. -->
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
          <!--
            A thread with a booking leads with when it is, the way Airbnb's row
            leads with its date range. One with no booking has nothing to put
            there, so the name moves up rather than leaving an empty line for
            the picture to align against.
          -->
          <div v-if="occurrenceLine(thread)" class="flex items-baseline justify-between gap-3 text-xs text-muted">
            <span class="min-w-0 flex-1 truncate">{{ occurrenceLine(thread) }}</span>
            <span class="shrink-0">{{ formatRelativeTime(thread.lastActivityAt) }}</span>
          </div>
          <div class="flex items-baseline justify-between gap-3">
            <p class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">{{ thread.guestName }}</p>
            <span v-if="!occurrenceLine(thread)" class="shrink-0 text-xs text-muted">{{ formatRelativeTime(thread.lastActivityAt) }}</span>
          </div>
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
        v-if="!loadingThreads && (pastOnly || threads.length > 0)"
        :to="{ path: listRoute, query: pastOnly ? withoutArchived : { ...route.query, archived: '' } }"
        class="flex items-center justify-between gap-3 px-4 py-4 text-sm font-medium text-default transition hover:bg-elevated/60"
        :class="threads.length ? 'mt-2 border-t border-default' : ''"
      >
        <span>{{ pastOnly ? 'Current conversations' : 'Past conversations' }}</span>
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
import type { LocationQueryRaw } from 'vue-router'
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
  scope: 'organization' | 'site'
  /** Locks the list to one kind, for a surface that is only ever about that kind. */
  submissionTypeFilter?: SubmissionType
  /** Rendered somewhere other than the messages screen: it opens nothing on its own. */
  embedded?: boolean
}>()
const emit = defineEmits<{ first: [target: { path: string; query: LocationQueryRaw } | null] }>()

const dashboard = useDashboardOrganization()
const { formatRelativeTime } = useHumanTime()

const route = useRoute()
const router = useRouter()

const isOrganizationScope = computed(() => props.scope === 'organization')
const siteId = computed(() => isOrganizationScope.value ? null : dashboard.organizationId.value)

const listRoute = computed(() => {
  const orgSlug = String(route.params.orgSlug)
  if (isOrganizationScope.value) return `/dashboard/${orgSlug}/messages`
  return `/dashboard/${orgSlug}/messages`
})

// The open thread, for the selected row. It is the segment below this list, so
// it is read from the route rather than tracked as state of its own.
const openThreadId = computed(() => {
  if (!route.path.startsWith(`${listRoute.value}/`)) return null
  return decodeURIComponent(route.path.slice(listRoute.value.length + 1).split('/')[0] ?? '') || null
})

// Filter and corpus live in the URL, so a filtered list is a link.
const pastOnly = computed(() => route.query.archived !== undefined)
const withoutArchived = computed(() => { const { archived: _archived, ...rest } = route.query; return rest })
const activeType = computed<SubmissionType | null>(() => {
  if (props.submissionTypeFilter) return props.submissionTypeFilter
  const value = route.query.filter
  return value === 'contact' || value === 'reservation' || value === 'booking' ? value : null
})
const unreadOnly = computed(() => route.query.unread === '1')

function setQuery(patch: Record<string, string | undefined>) {
  void router.replace({ path: route.path, query: { ...route.query, ...patch } })
}

function clearFilters() {
  void router.replace({ path: route.path, query: {} })
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
  const vertical = dashboard.organization.value?.vertical
  if (!vertical) return null
  try {
    const normalizedVertical = normalizeVertical(vertical) as SiteVertical
    const template = resolvePublicTemplate({ themeId: dashboard.organization.value?.theme_id, vertical }).slug
    return resolveCmsCapabilities(normalizedVertical, template, {
      site: parseCmsFeatureOverrideDelta(dashboard.organization.value?.feature_overrides),
    })
  } catch {
    return null
  }
})

const dashboardScope = useDashboardRouteScope()
const dashboardApi = useDashboardApi(dashboardScope)
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
const vertical = computed(() => dashboard.organization.value?.vertical ?? null)
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

const emptyTitle = computed(() => {
  if (filtersApplied.value) return 'No conversations match'
  return pastOnly.value ? 'Nothing here yet' : 'No conversations yet'
})
const emptyDescription = computed(() => {
  if (route.query.query) return `Nothing matched “${route.query.query}”.`
  if (filtersApplied.value) return 'Try a different filter, or clear them to see everything.'
  if (pastOnly.value) return 'Conversations move here once their booking has passed.'
  if (isOrganizationScope.value) return 'New guest conversations across all sites will appear here.'
  return 'New guest conversations will appear here.'
})

let threadsRequestToken = 0

const listQuery = computed(() => ({
  type: activeType.value ?? undefined,
  occurrence: pastOnly.value ? 'past' as const : 'upcoming' as const,
  unread: unreadOnly.value ? '1' as const : undefined,
}))

const initialThreadsKey = computed(() => [
  'dashboard-guest-threads',
  String(route.params.orgSlug ?? ''),
  siteId.value ?? 'org',
  props.scope,
  isOrganizationScope.value ? 'org' : 'site',
  activeType.value ?? 'all',
  pastOnly.value ? 'past' : 'current',
  unreadOnly.value ? 'unread' : 'any',
].join(':'))

const {
  data: initialThreads,
  pending: initialThreadsPending,
  error: initialThreadsError,
} = await useAsyncData<{ threads: ThreadListItem[] }>(initialThreadsKey, async () => {
  if (!dashboardScope.value) {
    throw createError({ statusCode: 400, statusMessage: 'Dashboard route scope is incomplete' })
  }
  if (isOrganizationScope.value) {
    return await dashboardApi<{ threads: ThreadListItem[] }>('/api/dashboard/guest-threads', {
      query: listQuery.value,
      validate: isThreadListResponse,
    })
  }
  return await dashboardApi<{ threads: ThreadListItem[] }>(
    `/api/dashboard/organizations/${siteId.value}/guest-threads`,
    {
      query: listQuery.value,
      validate: isThreadListResponse,
    },
  )
})

watch([initialThreads, initialThreadsPending, initialThreadsError], ([data, pending, error]) => {
  loadingThreads.value = pending
  threadsError.value = error
  threads.value = data?.threads ?? []
}, { immediate: true })

// The newest thread, for the index above to open into its second column on
// arrival. The list only says which; whether there is a column is the shell's.
watch([threads, openThreadId], ([rows, open]) => {
  if (open || isOrganizationScope.value || props.embedded) return
  const first = rows[0]
  emit('first', first ? { path: threadRoute(first), query: route.query } : null)
}, { immediate: true })

// A thread belongs to a site, and every read and mutation for one is
// site-scoped, so the organization index re-roots into the owning site's
// messages. Within a site or location the thread opens beside this list.
function threadRoute(thread: ThreadListItem) {
  if (!isOrganizationScope.value) return `${listRoute.value}/${encodeURIComponent(thread.id)}`
  if (!thread.siteSlug) throw createError({ statusCode: 500, statusMessage: 'Thread site route is unavailable' })
  const orgSlug = encodeURIComponent(String(route.params.orgSlug))
  return `/dashboard/${orgSlug}/messages/${encodeURIComponent(thread.id)}`
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
      : await dashboardApi<{ threads: ThreadListItem[] }>(`/api/dashboard/organizations/${siteId.value}/guest-threads`, {
        query: listQuery.value,
        validate: isThreadListResponse,
      })
    if (requestToken !== threadsRequestToken) return
    threads.value = res.threads ?? []
  } catch (error) {
    if (requestToken !== threadsRequestToken) return
    threadsError.value = error
  } finally {
    if (requestToken === threadsRequestToken) loadingThreads.value = false
  }
}

function refreshThreads() {
  realtime.connect()
  void loadThreads()
}


watch(realtime.event, (event) => {
  if (!event || !('threadId' in event)) return
  if (siteId.value && event.siteId !== siteId.value) return
  void loadThreads()
})

watch(realtime.connectionEpoch, (epoch) => {
  if (epoch > 0) refreshThreads()
})
</script>
