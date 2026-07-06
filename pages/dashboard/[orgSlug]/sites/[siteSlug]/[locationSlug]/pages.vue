<template>
  <UPage>

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
                <UBadge label="Live" color="success" variant="soft" size="xs" />
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

const siteId = await useDashboardSiteId()
const sitePublicUrl = ref<string | null>(null)
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
  icon: 'i-lucide-external-link',
  to: publicPath(path),
  target: '_blank' as const,
  external: true,
  color: 'neutral' as const,
  variant: 'ghost' as const
})

const _headerLinks = computed(() => buildHeaderLinks([
  { label: 'Content editor', icon: 'i-lucide-square-pen', to: paths.value.content, color: 'neutral' as const, variant: 'soft' as const }
]))

const pageRows = computed(() => [
  {
    key: 'home',
    label: 'Home',
    icon: 'i-lucide-house',
    scope: 'Brand',
    description: 'Hero media, story, primary CTA, featured locations, and first impression.',
    actions: [
      { label: 'Edit page', icon: 'i-lucide-square-pen', to: contentUrl('home'), color: 'primary' as const, variant: 'soft' as const },
      previewAction('/'),
      { label: 'Photos', icon: 'i-lucide-image', to: paths.value.photos, color: 'neutral' as const, variant: 'ghost' as const }
    ]
  },
  {
    key: 'about',
    label: 'About',
    icon: 'i-lucide-book-open',
    scope: 'Brand',
    description: 'Brand story, editorial imagery, journey copy, and brand-level CTA.',
    actions: [
      { label: 'Edit page', icon: 'i-lucide-square-pen', to: contentUrl('about'), color: 'primary' as const, variant: 'soft' as const },
      previewAction('/about')
    ]
  },
  {
    key: 'locations',
    label: 'Locations',
    icon: 'i-lucide-map-pin',
    scope: 'Location',
    description: 'Location directory, location home pages, local hours, address, maps, and hero media.',
    actions: [
      { label: 'Manage locations', icon: 'i-lucide-map-pin', to: paths.value.locations, color: 'primary' as const, variant: 'soft' as const },
      { label: 'Edit location page', icon: 'i-lucide-file-text', to: contentUrl('location'), color: 'neutral' as const, variant: 'ghost' as const },
      previewAction('/locations')
    ]
  },
  {
    key: 'menu',
    label: 'Menu',
    icon: 'i-lucide-list',
    scope: 'Location',
    description: 'Menu page hero copy plus menu sections, items, prices, photos, and availability.',
    actions: [
      { label: 'Manage menu', icon: 'i-lucide-list', to: paths.value.menu, color: 'primary' as const, variant: 'soft' as const },
      { label: 'Edit page copy', icon: 'i-lucide-file-text', to: contentUrl('menu'), color: 'neutral' as const, variant: 'ghost' as const },
      previewAction('/menu')
    ]
  },
  {
    key: 'reviews',
    label: 'Reviews',
    icon: 'i-lucide-star',
    scope: 'Location',
    description: 'Review cards, ratings, owner replies, moderation, and Google/manual sources.',
    actions: [
      { label: 'Manage reviews', icon: 'i-lucide-star', to: paths.value.reviews, color: 'primary' as const, variant: 'soft' as const },
      previewAction('/reviews')
    ]
  },
  {
    key: 'photos',
    label: 'Photos',
    icon: 'i-lucide-image',
    scope: 'Location',
    description: 'Guest-facing galleries, location media, hero assets, and uploaded or generated images.',
    actions: [
      { label: 'Manage photos', icon: 'i-lucide-image', to: paths.value.photos, color: 'primary' as const, variant: 'soft' as const },
      previewAction('/photos'),
      { label: 'Media library', icon: 'i-lucide-layout-dashboard', to: paths.value.media, color: 'neutral' as const, variant: 'ghost' as const }
    ]
  },
  {
    key: 'qa',
    label: 'Q&A',
    icon: 'i-lucide-circle-help',
    scope: 'Location',
    description: 'Public questions and owner answers for each location.',
    actions: [
      { label: 'Manage Q&A', icon: 'i-lucide-circle-help', to: paths.value.qa, color: 'primary' as const, variant: 'soft' as const },
      previewAction('/qa')
    ]
  },
  {
    key: 'contact',
    label: 'Contact',
    icon: 'i-lucide-mail',
    scope: 'Brand + Location',
    description: 'Contact page copy, maps, location contact details, and guest messages.',
    actions: [
      { label: 'Edit page', icon: 'i-lucide-square-pen', to: contentUrl('contact'), color: 'primary' as const, variant: 'soft' as const },
      previewAction('/contact'),
      { label: 'Inbox', icon: 'i-lucide-inbox', to: paths.value.inbox, color: 'neutral' as const, variant: 'ghost' as const }
    ]
  },
  {
    key: 'reservations',
    label: 'Reservations',
    icon: 'i-lucide-calendar-days',
    scope: 'Brand',
    description: 'Reservation page copy, policy text, contact details, and incoming booking requests.',
    actions: [
      { label: 'Manage reservations', icon: 'i-lucide-calendar-days', to: paths.value.reservations, color: 'primary' as const, variant: 'soft' as const },
      { label: 'Edit page copy', icon: 'i-lucide-file-text', to: contentUrl('reservations'), color: 'neutral' as const, variant: 'ghost' as const },
      previewAction('/reservations')
    ]
  },
  {
    key: 'order',
    label: 'Order Online',
    icon: 'i-lucide-shopping-bag',
    scope: 'Location',
    description: 'Delivery links, order page copy, and location-specific ordering options.',
    actions: [
      { label: 'Manage order', icon: 'i-lucide-shopping-bag', to: paths.value.order, color: 'primary' as const, variant: 'soft' as const },
      { label: 'Edit page copy', icon: 'i-lucide-file-text', to: contentUrl('order'), color: 'neutral' as const, variant: 'ghost' as const },
      previewAction('/order')
    ]
  }
])

async function loadSettings() {
  const res = await $fetch<{ success: boolean; settings: { public_url: string | null } }>(`/api/dashboard/settings`)
  sitePublicUrl.value = res.settings.public_url
}

onMounted(() => {
  loadSettings().catch((err) => console.warn('pages_settings_load_failed', err))
})

useSeoMeta({ title: 'Pages | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
