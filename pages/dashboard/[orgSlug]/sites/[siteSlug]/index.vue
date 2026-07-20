<template>
  <UPage class="h-full">
    <UPageBody>
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
        <UCard v-if="!checklistDismissed && !checklistAllDone && checklistItems.length" class="border-primary/20">
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
              <UButton :to="`/dashboard/${route.params.orgSlug}/~/settings/chatgpt`" variant="outline" color="neutral" size="sm">
                Open ChatGPT settings
              </UButton>
              <UButton variant="ghost" color="neutral" size="sm" @click="dismissChecklist">
                Dismiss
              </UButton>
            </div>
          </div>
        </UCard>

        <!-- Usage strip -->
        <div v-if="credits" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <UCard>
            <p class="text-xs text-muted">AI Credits</p>
            <p class="mt-1 text-2xl font-semibold text-highlighted tabular-nums">{{ credits.balance.toLocaleString() }}</p>
            <UProgress :model-value="credits.balance" :max="credits.balance + credits.lifetime_used"
              :color="credits.balance < 100 ? 'error' : credits.balance < 500 ? 'warning' : 'primary'" size="xs" class="mt-2" />
          </UCard>
          <UCard>
            <p class="text-xs text-muted">Locations</p>
            <p class="mt-1 text-2xl font-semibold text-highlighted">{{ locations.length }}</p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted">Reviews</p>
            <p class="mt-1 text-2xl font-semibold text-highlighted">
              {{ locations.reduce((s, l) => s + (l.review_count ?? 0), 0).toLocaleString() }}
            </p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted">Avg Rating</p>
            <p class="mt-1 text-2xl font-semibold text-highlighted">{{ avgRating ?? '—' }}</p>
          </UCard>
        </div>

        <div v-if="isProfessionalService" class="flex flex-wrap items-center justify-between gap-3 border-y border-default py-4">
          <div>
            <h2 class="text-sm font-semibold text-highlighted">Firm-wide content</h2>
            <p class="mt-1 text-xs text-muted">Manage Q&A and reviews that apply to the whole site.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton icon="i-lucide-building-2" color="neutral" variant="soft" :to="`${siteDashboardPath}/professional-services`">Organization & SEO</UButton>
            <UButton icon="i-lucide-circle-help" color="neutral" variant="soft" :to="`${siteDashboardPath}/qa`">Q&A</UButton>
            <UButton icon="i-lucide-star" color="neutral" variant="soft" :to="`${siteDashboardPath}/reviews`">Reviews</UButton>
          </div>
        </div>

        <!-- Site-wide content -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-y border-default py-4">
          <div>
            <h2 class="text-sm font-semibold text-highlighted">Site-wide content</h2>
            <p class="mt-1 text-xs text-muted">Manage blog posts for your site.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton icon="i-lucide-file-text" color="neutral" variant="soft" :to="`${siteDashboardPath}/blog`">Blog</UButton>
          </div>
        </div>

        <!-- Locations header + new button -->
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-highlighted">Locations</h2>
          <UButton
            icon="i-lucide-plus"
            label="Add location"
            size="sm"
            color="primary"
            variant="soft"
            :to="`/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/new`"
          />
        </div>

        <div v-if="locations.length === 0" class="py-16 text-center">
          <UIcon name="i-lucide-map-pin" class="size-8 text-muted mx-auto mb-3" />
          <p class="text-sm text-muted">No locations yet.</p>
          <UButton
            label="Add your first location"
            size="sm"
            color="primary"
            class="mt-4"
            :to="`/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/new`"
          />
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NuxtLink
            v-for="location in locations"
            :key="location.id"
            :to="`/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}/${location.slug}`"
            class="group block"
          >
            <UCard class="h-full transition-shadow group-hover:shadow-md cursor-pointer" :ui="{ body: 'p-0 sm:p-0' }">
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
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
import { buildOnboardingChecklistItems, buildOnboardingStarterPrompt, type OnboardingChecklistResponse } from '~/composables/useOnboardingPrompts'
import ChowBotPromptTrigger from '~/components/chowbot/ChowBotPromptTrigger.vue'

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

const requestEvent = useRequestEvent()

const { data, pending } = await useAsyncData(
  `dashboard-home-${route.params.orgSlug}-${route.params.siteSlug}`,
  async () => {
    await dashboardState.refresh()

    // Bypass the self-fetch entirely on the server — see "Nested SSR self-fetch
    // loses Cloudflare bindings" in CLAUDE.md. dashboardState.refresh() above is
    // already correctly org/site-scoped (it sends x-dashboard-org-slug/site-slug
    // explicitly from the route), so reuse its result instead of re-deriving org/site
    // from a second, easy-to-miss header build on this call.
    if (import.meta.server) {
      if (!requestEvent) return { locations: [], credits: null, events: [] }
      const organization = dashboardState.organization.value
      const site = dashboardState.site.value
      if (!organization || !site) return { locations: [], credits: null, events: [] }

      const [{ cloudflareEnv }, { getDashboardHomeData }] = await Promise.all([
        import('~/server/utils/api-response'),
        import('~/server/utils/dashboard-home'),
      ])
      const db = cloudflareEnv(requestEvent).db
      if (!db) throw createError({ statusCode: 500, statusMessage: 'Database not available' })
      return await getDashboardHomeData(db, organization.id, site.id)
    }

    return $fetch<{ locations: Location[]; credits: Credits | null; events: SiteEvent[] }>('/api/dashboard/home')
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
const isProfessionalService = computed(() => ['service', 'professional_service'].includes(dashboardState.site.value?.vertical ?? ''))
const siteDashboardPath = computed(() => `/dashboard/${route.params.orgSlug}/sites/${route.params.siteSlug}`)
const credits = computed(() => data.value?.credits ?? null)
const events = computed(() => data.value?.events ?? [])

// Getting-started task list — data source for both the checklist card and its
// per-item ChowBotPromptTrigger auto-send prompts.
const { data: onboardingData } = await useFetch<OnboardingChecklistResponse>('/api/dashboard/onboarding/checklist', {
  server: false,
  lazy: true,
})

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

const avgRating = computed(() => {
  const rated = locations.value.filter(l => l.rating != null)
  if (!rated.length) return null
  return (rated.reduce((s, l) => s + (l.rating ?? 0), 0) / rated.length).toFixed(1)
})

const { eventLabel, timeAgo } = useSiteEventLabels()
</script>
