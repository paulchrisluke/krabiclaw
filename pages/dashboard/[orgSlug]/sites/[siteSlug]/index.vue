<template>
  <UDashboardPanel id="site-overview">
    <template #header>
      <UDashboardNavbar :title="siteName">
        <template #leading>
          <DashboardSidebarCollapseButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="pending" class="space-y-6">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <USkeleton v-for="i in 4" :key="i" class="h-20 rounded-xl" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <USkeleton v-for="i in 3" :key="i" class="h-56 rounded-xl" />
        </div>
      </div>

      <div v-else class="space-y-6">
        <!-- Ask ChowBot anything -->
        <UChatPrompt
          v-if="canManageSite"
          v-model="homeInput"
          placeholder="Ask ChowBot anything..."
          :disabled="chowBot.isLoading.value"
          :loading="chowBot.isLoading.value"
          @submit="submitHomeInput"
        >
          <template #trailing>
            <UChatPromptSubmit
              :status="chowBot.isLoading.value ? 'streaming' : 'ready'"
              color="primary"
              variant="solid"
              size="xs"
              :disabled="!homeInput.trim()"
            />
          </template>
        </UChatPrompt>

        <!-- Getting started task list -->
        <UCard v-if="canManageSite && !checklistDismissed && !checklistAllDone && checklistItems.length" variant="soft" class="border-primary/20">
          <div class="space-y-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-wider text-primary mb-1">Getting started</p>
                <h3 class="text-base font-semibold text-highlighted">Finish setting up with ChowBot</h3>
                <p class="text-sm text-muted mt-0.5">
                  Ask ChowBot to complete these — your site gets better with each one.
                </p>
              </div>
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" square aria-label="Dismiss" @click="dismissChecklist" />
            </div>

            <div class="space-y-1">
              <div class="flex items-center justify-between text-xs text-muted">
                <span>{{ checklistCompletedCount }} of {{ checklistItems.length }} complete</span>
              </div>
              <UProgress :value="(checklistCompletedCount / checklistItems.length) * 100" class="h-1.5" />
            </div>

            <div class="space-y-2">
              <div class="flex items-center justify-between gap-3">
                <p class="text-xs font-semibold uppercase tracking-wider text-dimmed">Start here</p>
                <ChowBotPromptTrigger :prompt="checklistStarterPrompt" auto-send>
                  <template #default="{ trigger }">
                    <UButton icon="i-lucide-sparkles" color="primary" variant="soft" size="xs" @click="trigger">
                      Start
                    </UButton>
                  </template>
                </ChowBotPromptTrigger>
              </div>
              <div class="rounded-xl border border-default bg-elevated px-3 py-3 text-sm leading-relaxed text-highlighted">
                {{ checklistStarterPrompt }}
              </div>
            </div>

            <ul class="space-y-2.5">
              <li v-for="item in checklistItems" :key="item.key" class="flex items-start gap-3">
                <div :class="[
                  'flex size-5 shrink-0 items-center justify-center rounded-full mt-0.5 transition-colors',
                  item.complete ? 'bg-(--kc-teal)' : 'border-2 border-muted bg-transparent',
                ]">
                  <UIcon v-if="item.complete" name="i-lucide-check" class="size-3 text-white" />
                </div>
                <div class="min-w-0 flex-1">
                  <p :class="['text-sm font-medium', item.complete ? 'text-muted line-through' : 'text-highlighted']">
                    {{ item.label }}
                  </p>
                  <div v-if="!item.complete" class="mt-1.5">
                    <ChowBotPromptTrigger :prompt="item.prompt" auto-send>
                      <template #default="{ trigger }">
                        <UButton size="xs" color="neutral" variant="outline" @click="trigger">
                          Start
                        </UButton>
                      </template>
                    </ChowBotPromptTrigger>
                  </div>
                </div>
              </li>
            </ul>

            <div class="pt-1 flex items-center gap-3">
              <UButton to="/docs/integrations/mcp-setup" size="sm">
                Open setup docs
              </UButton>
              <UButton :to="`/dashboard/${route.params.orgSlug}/settings/chatgpt`" variant="outline" color="neutral" size="sm">
                Open ChatGPT settings
              </UButton>
              <UButton variant="ghost" color="neutral" size="sm" @click="dismissChecklist">
                Dismiss
              </UButton>
            </div>
          </div>
        </UCard>

        <div v-if="canManageSite && isProfessionalService" class="flex flex-wrap items-center justify-between gap-3 border-y border-default py-4">
          <div>
            <h2 class="text-sm font-semibold text-highlighted">Firm-wide content</h2>
            <p class="mt-1 text-xs text-muted">Manage Q&A and testimonials that apply to the whole site.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton v-if="hasSiteServicesManager" icon="i-lucide-building-2" color="neutral" variant="soft" :to="`${siteDashboardPath}/professional-services`">Professional services</UButton>
            <UButton icon="i-lucide-circle-help" color="neutral" variant="soft" :to="`${siteDashboardPath}/qa`">Q&A</UButton>
            <UButton icon="i-lucide-star" color="neutral" variant="soft" :to="`${siteDashboardPath}/testimonials`">Testimonials</UButton>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <UCard>
            <p class="text-sm text-muted">Publication</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <UBadge :color="dashboardState.site.value?.status === 'active' ? 'success' : 'neutral'" variant="soft" class="capitalize">
                {{ dashboardState.site.value?.status || 'Unknown' }}
              </UBadge>
              <UBadge v-if="dashboardState.site.value?.onboarding_status" color="neutral" variant="soft" class="capitalize">
                {{ dashboardState.site.value.onboarding_status.replace(/_/g, ' ') }}
              </UBadge>
            </div>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">{{ locationsNavLabel }}</p>
            <p class="mt-2 text-2xl font-semibold text-highlighted">{{ locations.length }}</p>
            <UButton class="mt-3" size="xs" color="neutral" variant="ghost" :to="locationsBase">Open index</UButton>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">Unread inbox</p>
            <p class="mt-2 text-2xl font-semibold text-highlighted">{{ operations.unreadThreads }}</p>
            <UButton class="mt-3" size="xs" color="neutral" variant="ghost" :to="`${siteDashboardPath}/inbox`">Open inbox</UButton>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">Open guest work</p>
            <p class="mt-2 text-2xl font-semibold text-highlighted">{{ operations.openThreads }}</p>
            <p class="mt-2 text-xs text-muted">{{ operationBreakdown }}</p>
          </UCard>
        </div>

        <!-- Locations preview -->
        <div v-if="locations.length > 0">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold text-highlighted">Locations</h2>
            <UButton
              v-if="locations.length > 3"
              :to="locationsBase ?? `${siteDashboardPath}/locations`"
              size="sm"
              color="neutral"
              variant="ghost"
            >
              See all
            </UButton>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <NuxtLink
              v-for="location in previewLocations"
              :key="location.id"
              :to="`${locationsBase}/${location.slug}`"
              class="group block"
            >
              <UCard variant="soft" class="h-full cursor-pointer">
                <div class="aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
                  <img
                    v-if="location.hero_url"
                    :src="cfImageVariant(location.hero_url, { width: 640 }) ?? undefined"
                    :alt="location.title"
                    class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div v-else class="flex h-full items-center justify-center">
                    <UIcon name="i-lucide-map-pin" class="size-8 text-muted" />
                  </div>
                </div>
                <div class="p-4 space-y-2">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-highlighted truncate">{{ location.title }}</p>
                      <p v-if="location.city" class="text-xs text-muted">{{ location.city }}</p>
                    </div>
                    <UBadge v-if="location.is_primary" color="primary" variant="soft" size="xs">Primary</UBadge>
                  </div>
                  <div v-if="location.rating || location.review_count" class="flex items-center gap-3 text-xs text-muted">
                    <span v-if="location.rating" class="flex items-center gap-1">
                      <UIcon name="i-lucide-star" class="size-3 text-warning-400 fill-warning-400" />
                      {{ location.rating.toFixed(1) }}
                    </span>
                    <span v-if="location.review_count">{{ location.review_count.toLocaleString() }} reviews</span>
                  </div>
                  <p class="text-xs text-muted">Updated {{ timeAgo(location.updated_at) }}</p>
                </div>
              </UCard>
            </NuxtLink>
          </div>
        </div>

        <UCard v-if="events.length > 0" title="Recent Activity">
          <ul class="-mx-4 -mb-4">
            <li v-for="ev in events" :key="ev.id" class="flex items-start gap-3 px-4 py-3 border-b border-default last:border-0">
              <UAvatar :src="ev.actor_image ?? undefined" :alt="ev.actor_name ?? 'System'" size="2xs" class="mt-0.5 shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-xs text-highlighted leading-snug">
                  {{ eventLabel(ev.event_type) }}
                  <span v-if="ev.location_title" class="text-muted"> · {{ ev.location_title }}</span>
                </p>
                <p class="text-xs text-muted mt-0.5">{{ timeAgo(ev.created_at) }}</p>
              </div>
            </li>
          </ul>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { buildOnboardingChecklistItems, buildOnboardingStarterPrompt, type OnboardingChecklistResponse } from '~/composables/useOnboardingPrompts'
import ChowBotPromptTrigger from '~/components/chowbot/ChowBotPromptTrigger.vue'
import { parseCmsFeatureOverrideDelta, resolveCmsCapabilities } from '~/config/cms-registry'
import { resolvePublicTemplate } from '~/utils/template-registry'
import { normalizeVertical, type SiteVertical } from '~/utils/vertical-copy'

definePageMeta({ layout: 'dashboard' })
useSeoMeta({ title: 'Dashboard | KrabiClaw', robots: 'noindex, nofollow' })

const route = useRoute()
const dashboardState = useDashboardSite()

interface Location {
  id: string; slug: string; title: string; city: string | null
  rating: number | null; review_count: number | null
  is_primary: boolean; status: string; updated_at: string
  hero_url: string | null
}
interface Credits { balance: number; lifetime_used: number; last_topped_up_at: string | null }
interface SiteEvent {
  id: string; event_type: string; location_id: string | null
  metadata: Record<string, unknown> | null; created_at: string
  actor_name: string | null; actor_image: string | null; location_title: string | null
}
interface OperationsSummary {
  openThreads: number
  unreadThreads: number
  reservations: number
  experienceBookings: number
}

const requestEvent = useRequestEvent()

const { data, pending } = await useAsyncData(
  `dashboard-home-${route.params.orgSlug}-${route.params.siteSlug}`,
  async () => {
    // Bypass the self-fetch entirely on the server — see "Nested SSR self-fetch
    // loses Cloudflare bindings" in CLAUDE.md. dashboardState.refresh() does its
    // own $fetch to /api/dashboard/context, which has the exact same nested-fetch
    // problem during SSR — call getDashboardContext directly against the real
    // request event instead, and only use dashboardState.refresh() client-side.
    if (import.meta.server) {
      if (!requestEvent) {
        throw createError({ statusCode: 500, statusMessage: 'Request context unavailable' })
      }

      const [{ cloudflareEnv }, { getDashboardContext }, { getDashboardHomeData }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/dashboard-context'),
        import('~/server/utils/dashboard-home'),
      ])

      // getDashboardContext resolves org/site from the x-dashboard-org-slug/site-slug
      // headers (see plugins/dashboard-site-header.client.ts), which the real inbound
      // SSR request never carries — this route's params are already the authoritative
      // source for them, so set the headers directly on the real event rather than
      // re-deriving them through a second fetch.
      const orgSlug = typeof route.params.orgSlug === 'string' ? route.params.orgSlug : null
      const siteSlug = typeof route.params.siteSlug === 'string' ? route.params.siteSlug : null
      if (orgSlug) requestEvent.node.req.headers['x-dashboard-org-slug'] = orgSlug
      if (siteSlug) requestEvent.node.req.headers['x-dashboard-site-slug'] = siteSlug

      // requireOrganization defaults to true, so a missing/inaccessible organization
      // throws here rather than needing a manual null check. A missing site is a
      // legitimate state (mirrors home.get.ts's own `!site` branch, e.g. onboarding
      // in progress) and returns empty data rather than erroring.
      const context = await getDashboardContext(requestEvent, { requireSite: false })
      if (!context.site) {
        return {
          locations: [],
          credits: null,
          events: [],
          operations: { openThreads: 0, unreadThreads: 0, reservations: 0, experienceBookings: 0 },
        }
      }

      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      return await getDashboardHomeData(db, context.organization.id, context.site.id, {
        memberId: context.organization.memberId,
        role: context.organization.role,
      })
    }

    await dashboardState.refresh()
    return $fetch<{ locations: Location[]; credits: Credits | null; events: SiteEvent[]; operations: OperationsSummary }>('/api/dashboard/home')
  },
  // Reuse the SSR payload on first hydration (avoids a redundant duplicate fetch
  // on initial load), but force a fresh fetch on every subsequent client-side
  // navigation back to this page — otherwise this overview keeps showing
  // "No locations yet" after a location was added elsewhere in the same SPA
  // session (e.g. via the add-location wizard), since the key doesn't change
  // between visits and Nuxt would otherwise reuse the stale cached result.
  { getCachedData: (key, nuxtApp) => nuxtApp.isHydrating ? nuxtApp.payload.data[key] : undefined }
)

const locations = computed(() => data.value?.locations ?? [])
const previewLocations = computed(() => locations.value.slice(0, 3))
const siteName = computed(() => dashboardState.site.value?.brand_name ?? 'Overview')
const canManageSite = computed(() => dashboardState.siteAccess.value === 'organization' || dashboardState.siteAccess.value === 'site')
const isProfessionalService = computed(() => ['service', 'professional_service'].includes(dashboardState.site.value?.vertical ?? ''))
const siteCapabilities = computed(() => {
  const vertical = dashboardState.site.value?.vertical
  if (!vertical) return null
  try {
    const normalizedVertical = normalizeVertical(vertical) as SiteVertical
    const template = resolvePublicTemplate({ vertical }).slug
    return resolveCmsCapabilities(normalizedVertical, template, {
      site: parseCmsFeatureOverrideDelta(dashboardState.site.value?.feature_overrides),
    })
  } catch {
    return null
  }
})
const hasSiteServicesManager = computed(() => Boolean(siteCapabilities.value?.managers.some(manager => manager.key === 'site.services')))
const siteDashboardPath = computed(() => `/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}`)
const locationsBase = computed(() => `${siteDashboardPath.value}/locations`)
const events = computed(() => data.value?.events ?? [])
const operations = computed<OperationsSummary>(() => data.value?.operations ?? {
  openThreads: 0,
  unreadThreads: 0,
  reservations: 0,
  experienceBookings: 0,
})
const hasReservations = computed(() => Boolean(siteCapabilities.value?.managers.some(manager => manager.id === 'reservations')))
const hasExperiences = computed(() => Boolean(siteCapabilities.value?.managers.some(manager => manager.id === 'experiences')))
const locationsNavLabel = computed(() => siteCapabilities.value?.locationVocabulary === 'office/service area' ? 'Offices / Service Areas' : 'Locations')
const operationBreakdown = computed(() => {
  const parts: string[] = []
  if (hasReservations.value) parts.push(`${operations.value.reservations} reservations`)
  if (hasExperiences.value) parts.push(`${operations.value.experienceBookings} bookings`)
  return parts.length ? parts.join(' · ') : 'Contact messages'
})

// Getting-started task list — data source for both the checklist card and its
// per-item ChowBotPromptTrigger auto-send prompts.
const { data: onboardingData, execute: loadOnboardingChecklist } = await useFetch<OnboardingChecklistResponse>('/api/dashboard/onboarding/checklist', {
  key: computed(() => `dashboard-onboarding-checklist:${String(route.params.orgSlug)}:${String(route.params.siteSlug)}`),
  server: false,
  lazy: true,
  immediate: false,
})
watch([canManageSite, () => route.params.orgSlug, () => route.params.siteSlug], ([allowed]) => {
  if (allowed) void loadOnboardingChecklist()
  else onboardingData.value = undefined
}, { immediate: true })

const checklistItems = computed(() => buildOnboardingChecklistItems(onboardingData.value))
const checklistStarterPrompt = computed(() => buildOnboardingStarterPrompt(onboardingData.value, checklistItems.value))
const checklistCompletedCount = computed(() => checklistItems.value.filter(i => i.complete).length)
const checklistAllDone = computed(() => checklistItems.value.length > 0 && checklistCompletedCount.value === checklistItems.value.length)

const checklistDismissKey = computed(() => `kc_checklist_dismissed_${route.params.orgSlug}`)
const checklistDismissed = ref(false)
watch(checklistDismissKey, (key) => {
  if (!import.meta.client) return
  checklistDismissed.value = localStorage.getItem(key) === '1'
}, { immediate: true })
function dismissChecklist() {
  localStorage.setItem(checklistDismissKey.value, '1')
  checklistDismissed.value = true
}

const chowBot = useChowBot()
const homeInput = ref('')
async function submitHomeInput() {
  const text = homeInput.value.trim()
  if (!text) return
  homeInput.value = ''
  chowBot.open()
  await chowBot.sendMessage(text)
}

const { eventLabel, timeAgo } = useSiteEventLabels()
</script>
