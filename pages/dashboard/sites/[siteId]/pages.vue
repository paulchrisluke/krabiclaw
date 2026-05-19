<template>
  <UPage>
    <UPageHeader
      title="Pages"
      description="Every public page, the content it owns, and the operational data that feeds it."
    >
      <template #links>
        <DashboardSiteHeaderLinks :links="headerLinks" />
      </template>
    </UPageHeader>

    <UPageBody>
      <div class="grid gap-3">
        <div
          v-for="page in pageRows"
          :key="page.key"
          class="rounded-lg border border-default bg-default p-4"
        >
          <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <UIcon :name="page.icon" class="size-4 text-muted" />
                <h2 class="font-semibold text-highlighted">{{ page.label }}</h2>
                <UBadge :label="page.scope" color="neutral" variant="soft" size="xs" />
                <UBadge
                  :label="page.draftCount ? `${page.draftCount} draft edits` : 'Live'"
                  :color="page.draftCount ? 'warning' : 'success'"
                  variant="soft"
                  size="xs"
                />
              </div>
              <p class="mt-1 text-sm text-muted">{{ page.description }}</p>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="action in page.actions"
                :key="action.label"
                v-bind="action"
                size="sm"
              />
            </div>
          </div>
        </div>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const siteId = route.params.siteId as string
const sitePublicUrl = ref<string | null>(null)
const draftCounts = ref<Record<string, number>>({})
const { paths, buildHeaderLinks } = useDashboardSiteLinks(siteId, sitePublicUrl)

const contentUrl = (page: string) => `${paths.value.content}?page=${page}`
const publicPath = (path: string) => {
  if (!sitePublicUrl.value) return undefined
  try {
    return new URL(path, sitePublicUrl.value).toString()
  } catch {
    return undefined
  }
}
const previewAction = (path: string) => ({
  label: 'View live',
  icon: 'i-heroicons-arrow-top-right-on-square',
  to: publicPath(path),
  target: '_blank' as const,
  external: true,
  color: 'neutral' as const,
  variant: 'ghost' as const
})

const headerLinks = computed(() => buildHeaderLinks([
  { label: 'Content editor', icon: 'i-heroicons-pencil-square', to: paths.value.content, color: 'neutral' as const, variant: 'soft' as const }
]))

const pageRows = computed(() => [
  {
    key: 'home',
    label: 'Home',
    icon: 'i-heroicons-home',
    scope: 'Brand',
    draftCount: draftCounts.value.home ?? 0,
    description: 'Hero media, story, primary CTA, featured locations, and first impression.',
    actions: [
      { label: 'Edit page', icon: 'i-heroicons-pencil-square', to: contentUrl('home'), color: 'primary' as const, variant: 'soft' as const },
      previewAction('/'),
      { label: 'Photos', icon: 'i-heroicons-photo', to: paths.value.photos, color: 'neutral' as const, variant: 'ghost' as const }
    ]
  },
  {
    key: 'about',
    label: 'About',
    icon: 'i-heroicons-book-open',
    scope: 'Brand',
    draftCount: draftCounts.value.about ?? 0,
    description: 'Restaurant story, editorial imagery, journey copy, and brand-level CTA.',
    actions: [
      { label: 'Edit page', icon: 'i-heroicons-pencil-square', to: contentUrl('about'), color: 'primary' as const, variant: 'soft' as const },
      previewAction('/about')
    ]
  },
  {
    key: 'locations',
    label: 'Locations',
    icon: 'i-heroicons-map-pin',
    scope: 'Location',
    draftCount: draftCounts.value.location ?? 0,
    description: 'Location directory, location home pages, local hours, address, maps, and hero media.',
    actions: [
      { label: 'Manage locations', icon: 'i-heroicons-map-pin', to: paths.value.locations, color: 'primary' as const, variant: 'soft' as const },
      { label: 'Edit location page', icon: 'i-heroicons-document-text', to: contentUrl('location'), color: 'neutral' as const, variant: 'ghost' as const },
      previewAction('/locations')
    ]
  },
  {
    key: 'menu',
    label: 'Menu',
    icon: 'i-heroicons-list-bullet',
    scope: 'Location',
    draftCount: draftCounts.value.menu ?? 0,
    description: 'Menu page hero copy plus menu sections, items, prices, photos, and availability.',
    actions: [
      { label: 'Manage menu', icon: 'i-heroicons-list-bullet', to: paths.value.menu, color: 'primary' as const, variant: 'soft' as const },
      { label: 'Edit page copy', icon: 'i-heroicons-document-text', to: contentUrl('menu'), color: 'neutral' as const, variant: 'ghost' as const },
      previewAction('/menu')
    ]
  },
  {
    key: 'reviews',
    label: 'Reviews',
    icon: 'i-heroicons-star',
    scope: 'Location',
    draftCount: 0,
    description: 'Review cards, ratings, owner replies, moderation, and Google/manual sources.',
    actions: [
      { label: 'Manage reviews', icon: 'i-heroicons-star', to: paths.value.reviews, color: 'primary' as const, variant: 'soft' as const },
      previewAction('/reviews')
    ]
  },
  {
    key: 'photos',
    label: 'Photos',
    icon: 'i-heroicons-photo',
    scope: 'Location',
    draftCount: 0,
    description: 'Guest-facing galleries, location media, hero assets, and uploaded or generated images.',
    actions: [
      { label: 'Manage photos', icon: 'i-heroicons-photo', to: paths.value.photos, color: 'primary' as const, variant: 'soft' as const },
      previewAction('/photos'),
      { label: 'Media library', icon: 'i-heroicons-squares-2x2', to: paths.value.media, color: 'neutral' as const, variant: 'ghost' as const }
    ]
  },
  {
    key: 'qa',
    label: 'Q&A',
    icon: 'i-heroicons-question-mark-circle',
    scope: 'Location',
    draftCount: 0,
    description: 'Public questions and owner answers for each location.',
    actions: [
      { label: 'Manage Q&A', icon: 'i-heroicons-question-mark-circle', to: paths.value.qa, color: 'primary' as const, variant: 'soft' as const },
      previewAction('/qa')
    ]
  },
  {
    key: 'contact',
    label: 'Contact',
    icon: 'i-heroicons-envelope',
    scope: 'Brand + Location',
    draftCount: draftCounts.value.contact ?? 0,
    description: 'Contact page copy, maps, location contact details, and guest messages.',
    actions: [
      { label: 'Edit page', icon: 'i-heroicons-pencil-square', to: contentUrl('contact'), color: 'primary' as const, variant: 'soft' as const },
      previewAction('/contact'),
      { label: 'Inbox', icon: 'i-heroicons-inbox', to: paths.value.inbox, color: 'neutral' as const, variant: 'ghost' as const }
    ]
  },
  {
    key: 'reservations',
    label: 'Reservations',
    icon: 'i-heroicons-calendar-days',
    scope: 'Brand',
    draftCount: draftCounts.value.reservations ?? 0,
    description: 'Reservation page copy, policy text, contact details, and incoming booking requests.',
    actions: [
      { label: 'Manage reservations', icon: 'i-heroicons-calendar-days', to: paths.value.reservations, color: 'primary' as const, variant: 'soft' as const },
      { label: 'Edit page copy', icon: 'i-heroicons-document-text', to: contentUrl('reservations'), color: 'neutral' as const, variant: 'ghost' as const },
      previewAction('/reservations')
    ]
  },
  {
    key: 'order',
    label: 'Order Online',
    icon: 'i-heroicons-shopping-bag',
    scope: 'Location',
    draftCount: draftCounts.value.order ?? 0,
    description: 'Delivery links, order page copy, and location-specific ordering options.',
    actions: [
      { label: 'Manage order', icon: 'i-heroicons-shopping-bag', to: paths.value.order, color: 'primary' as const, variant: 'soft' as const },
      { label: 'Edit page copy', icon: 'i-heroicons-document-text', to: contentUrl('order'), color: 'neutral' as const, variant: 'ghost' as const },
      previewAction('/order')
    ]
  }
])

async function loadSettings() {
  const res = await $fetch<{ success: boolean; settings: { public_url: string | null } }>(`/api/sites/${siteId}/settings`)
  sitePublicUrl.value = res.settings.public_url
}

async function loadDraftStatuses() {
  const pages = ['home', 'about', 'location', 'menu', 'contact', 'reservations', 'order']
  const results = await Promise.allSettled(pages.map(async (page) => {
    const res = await $fetch<{ count: number }>(`/api/editor/sites/${siteId}/content/status`, { query: { page } })
    return [page, res.count] as const
  }))
  const entries = results.map((result, index) => {
    const page = pages[index]!
    if (result.status === 'fulfilled') return result.value
    console.warn('draft_status_load_failed', { page, error: result.reason })
    return [page, 0] as const
  })
  draftCounts.value = Object.fromEntries(entries)
}

onMounted(() => {
  loadSettings().catch(() => {})
  loadDraftStatuses().catch(() => {})
})

useSeoMeta({ title: 'Pages | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
