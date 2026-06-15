<template>
  <UPage class="h-full">
    <UPageBody v-if="!loading && !hasRestaurant">
      <div class="py-12 text-center text-muted">
        <p class="text-sm">Connect your ChatGPT account to get started.</p>
      </div>
    </UPageBody>

    <UPageBody v-else>
      <!-- Skeleton -->
      <div v-if="loading" class="space-y-6">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <USkeleton v-for="i in 4" :key="i" class="h-20 rounded-xl" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <USkeleton v-for="i in 3" :key="i" class="h-56 rounded-xl" />
        </div>
      </div>

      <div v-else class="space-y-6">
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
            <p class="mt-1 text-2xl font-semibold text-highlighted">
              {{ avgRating ?? '—' }}
            </p>
          </UCard>
        </div>

        <!-- Location cards -->
        <div v-if="locations.length === 0" class="py-16 text-center">
          <p class="text-sm text-muted">No locations yet.</p>
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NuxtLink
            v-for="location in locations"
            :key="location.id"
            :to="`/dashboard/${route.params.orgSlug}/${location.slug}`"
            class="group block"
          >
            <UCard class="h-full transition-shadow group-hover:shadow-md cursor-pointer" :ui="{ body: 'p-0 sm:p-0' }">
              <div class="aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
                <img
                  v-if="location.hero_url"
                  :src="location.thumbnail_url ?? location.hero_url"
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

        <!-- Recent Activity (below cards, only if there are events) -->
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
definePageMeta({ layout: 'dashboard', ssr: false })
useSeoMeta({ title: 'Restaurant | KrabiClaw Dashboard', robots: 'noindex, nofollow' })

const route = useRoute()
const dashboardState = useDashboardRestaurant()

interface Location {
  id: string; slug: string; title: string; city: string | null
  rating: number | null; review_count: number | null
  is_primary: boolean; status: string; updated_at: string
  hero_url: string | null; thumbnail_url: string | null
}
interface Credits { balance: number; lifetime_used: number; last_topped_up_at: string | null }
interface SiteEvent {
  id: string; event_type: string; location_id: string | null
  metadata: Record<string, unknown> | null; created_at: string
  actor_name: string | null; actor_image: string | null; location_title: string | null
}

const loading = ref(true)
const locations = ref<Location[]>([])
const credits = ref<Credits | null>(null)
const events = ref<SiteEvent[]>([])
const hasRestaurant = computed(() => Boolean(dashboardState.restaurant.value))

const avgRating = computed(() => {
  const rated = locations.value.filter(l => l.rating)
  if (!rated.length) return null
  return (rated.reduce((s, l) => s + (l.rating ?? 0), 0) / rated.length).toFixed(1)
})

const EVENT_LABELS: Record<string, string> = {
  'post.published': 'Published a post', 'menu.item_added': 'Added a menu item',
  'menu.item_updated': 'Updated a menu item', 'content.updated': 'Updated content',
  'media.uploaded': 'Uploaded media', 'review.received': 'New review received',
  'reservation.created': 'New reservation', 'location.created': 'Added a location',
  'location.gmb_connected': 'Connected Google Business',
}
function eventLabel(type: string) { return EVENT_LABELS[type] ?? type.replace('.', ' ') }
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days < 30 ? `${days}d ago` : new Date(dateStr).toLocaleDateString()
}

onMounted(async () => {
  try {
    await dashboardState.refresh()
    if (!dashboardState.restaurant.value) {
      return
    }
    const data = await $fetch<{ locations: Location[]; credits: Credits | null; events: SiteEvent[] }>('/api/dashboard/home')
    locations.value = data.locations
    credits.value = data.credits
    events.value = data.events
  } finally {
    loading.value = false
  }
})
</script>
