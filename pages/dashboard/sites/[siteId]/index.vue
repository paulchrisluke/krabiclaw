<template>
  <UPage>
    <UPageHeader
      title="Overview"
      :description="site ? `${site.name} website workspace` : 'Website workspace'"
      :links="headerLinks"
    />

    <UPageBody>
      <div v-if="loading" class="grid gap-4">
        <USkeleton class="h-32 w-full" />
        <USkeleton class="h-48 w-full" />
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
        :description="error"
      />

      <div v-else-if="site" class="space-y-6">
        <UCard v-if="locations.length === 0">
          <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center">
            <div>
              <UBadge color="warning" variant="soft">Location required</UBadge>
              <h2 class="mt-4 text-2xl font-semibold text-[var(--ui-text-highlighted)]">Add your first location</h2>
              <p class="mt-2 max-w-2xl text-sm text-[var(--ui-text-muted)]">
                Location content, menus, hours, addresses, and Google Business sync all start with a physical location.
              </p>
            </div>

            <div class="flex flex-col gap-2">
              <UButton
                :to="`/dashboard/sites/${siteId}/settings?tab=locations`"
                icon="i-heroicons-plus"
                size="lg"
                block
              >
                Add Location
              </UButton>
              <UButton
                :to="`/dashboard/sites/${siteId}/content`"
                icon="i-heroicons-document-text"
                color="neutral"
                variant="soft"
                block
              >
                Edit Brand Pages
              </UButton>
            </div>
          </div>
        </UCard>

        <div v-else>
          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-4">
                <div>
                  <h2 class="font-semibold text-[var(--ui-text-highlighted)]">Locations</h2>
                  <p class="mt-1 text-sm text-[var(--ui-text-muted)]">Choose a location to edit local content, menu, and details.</p>
                </div>
                <UButton
                  :to="`/dashboard/sites/${siteId}/locations`"
                  icon="i-heroicons-arrow-right"
                  trailing
                  color="neutral"
                  variant="soft"
                >
                  Manage All
                </UButton>
              </div>
            </template>

            <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <NuxtLink
                v-for="location in locations"
                :key="location.id"
                :to="`/dashboard/sites/${siteId}/menu?locationId=${location.id}`"
                class="group relative rounded-lg border border-[var(--ui-border)] p-4 transition hover:border-[var(--ui-border-muted)] hover:bg-[var(--ui-bg-muted)]"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <p class="truncate font-medium text-[var(--ui-text-highlighted)]">{{ location.title }}</p>
                      <UBadge v-if="location.is_primary" color="primary" variant="soft" size="xs">Primary</UBadge>
                    </div>
                    <p class="mt-1 truncate text-sm text-[var(--ui-text-muted)]">{{ addressLabel(location) || location.city || `/${location.slug}` }}</p>
                  </div>
                  <UIcon name="i-heroicons-arrow-right" class="size-4 shrink-0 text-[var(--ui-text-muted) transition group-hover:text-[var(--ui-primary)]" />
                </div>
                <div class="mt-3 flex items-center gap-2">
                  <UButton
                    :to="`/dashboard/sites/${siteId}/menu?locationId=${location.id}`"
                    size="xs"
                    block
                  >
                    Edit Menu
                  </UButton>
                  <UButton
                    :to="`/dashboard/sites/${siteId}/settings?tab=locations&locationId=${location.id}`"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-heroicons-cog-6-tooth"
                  />
                </div>
              </NuxtLink>
            </div>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="font-semibold text-[var(--ui-text-highlighted)]">Launch Readiness</h2>
                <p class="mt-1 text-sm text-[var(--ui-text-muted)]">Complete these steps to go live</p>
              </div>
              <UBadge :color="launchProgress === 100 ? 'success' : 'warning'" variant="soft" size="lg">
                {{ launchProgress }}%
              </UBadge>
            </div>
          </template>

          <div class="space-y-4">
            <UProgress :value="launchProgress" size="md" color="primary" />

            <div class="grid gap-3 sm:grid-cols-2">
              <div
                v-for="item in requiredFields"
                :key="item.label"
                class="flex items-center justify-between gap-3 rounded-lg border p-4"
                :class="item.done ? 'border-[var(--ui-border)] bg-[var(--ui-bg)]' : 'border-[var(--ui-border-muted)] bg-[var(--ui-bg-muted)]'"
              >
                <div class="flex items-center gap-3">
                  <div class="size-5 rounded-full flex items-center justify-center" :class="item.done ? 'bg-green-500' : 'bg-[var(--ui-border-muted)]'">
                    <UIcon v-if="item.done" name="i-heroicons-check" class="size-3 text-white" />
                  </div>
                  <span class="text-sm font-medium" :class="item.done ? 'text-[var(--ui-text-highlighted)]' : 'text-[var(--ui-text-muted)]'">
                    {{ item.label }}
                  </span>
                </div>
                <UButton
                  v-if="!item.done && item.to"
                  :to="item.to"
                  size="xs"
                  variant="ghost"
                  color="primary"
                >
                  Fix
                </UButton>
              </div>
            </div>
          </div>
        </UCard>

        <div class="grid gap-4 md:grid-cols-3">
          <UCard>
            <p class="text-sm text-[var(--ui-text-muted)]">Locations</p>
            <p class="mt-2 text-3xl font-semibold text-[var(--ui-text-highlighted)]">{{ locations.length }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-[var(--ui-text-muted)]">Menu items</p>
            <p class="mt-2 text-3xl font-semibold text-[var(--ui-text-highlighted)]">{{ menuItemsCount }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-[var(--ui-text-muted)]">Reviews</p>
            <p class="mt-2 text-3xl font-semibold text-[var(--ui-text-highlighted)]">{{ reviewCount }}</p>
          </UCard>
        </div>
      </div>
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

interface BusinessLocation {
  id: string
  slug: string
  title: string
  address: { addressLines?: string[] } | null
  city: string | null
  phone: string | null
  is_primary: boolean
  status: string
}

const route = useRoute()
const config = useRuntimeConfig()
const siteId = route.params.siteId as string

const loading = ref(true)
const error = ref<string | null>(null)
const site = ref<any>(null)
const launchReadiness = ref<any>(null)
const locations = ref<BusinessLocation[]>([])
const menuItemsCount = ref(0)
const reviewCount = ref(0)

const requiredFields = computed(() => [
  { label: 'Restaurant name', done: !!site.value?.brand_name, to: `/dashboard/sites/${siteId}/settings` },
  { label: 'Primary location', done: locations.value.length > 0, to: `/dashboard/sites/${siteId}/locations` },
  { label: 'Phone number', done: !!primaryLocation.value?.phone, to: `/dashboard/sites/${siteId}/settings?tab=locations&locationId=${primaryLocation.value?.id || locations.value[0]?.id}` },
  { label: 'At least 3 menu items', done: menuItemsCount.value >= 3, to: { path: `/dashboard/sites/${siteId}/menu`, query: { locationId: primaryLocation.value?.id || locations.value[0]?.id } } }
])

const launchProgress = computed(() => {
  const done = requiredFields.value.filter(item => item.done).length
  return Math.round((done / requiredFields.value.length) * 100)
})

const platformHostname = computed(() => {
  const domain = config.public.freeSiteDomain
  return domain.replace(/^https?:\/\//, '')
})

const primaryLocation = computed(() =>
  locations.value.find(location => location.is_primary) || locations.value[0] || null
)

const publicUrl = computed(() => {
  if (!site.value?.subdomain) return undefined
  return `https://${site.value.subdomain}.${platformHostname.value}`
})

const headerLinks = computed(() => [
  {
    label: 'View Live Site',
    icon: 'i-heroicons-arrow-top-right-on-square',
    to: publicUrl.value,
    target: '_blank',
    color: 'neutral' as const,
    variant: 'outline' as const,
    disabled: !publicUrl.value
  }
])

const addressLabel = (location: BusinessLocation) =>
  location.address?.addressLines?.join(', ') || ''

const loadSiteData = async () => {
  loading.value = true
  error.value = null

  try {
    const [settingsResponse, locationsResponse, menuResponse, googleResponse] = await Promise.all([
      $fetch<any>(`/api/sites/${siteId}/settings`),
      $fetch<any>(`/api/sites/${siteId}/locations`),
      $fetch<any>(`/api/public/sites/${siteId}/menus`),
      $fetch<any>(`/api/public/sites/${siteId}/google-business`)
    ])

    if (!settingsResponse.success) throw new Error('Failed to load site settings')
    if (!locationsResponse.success) throw new Error('Failed to load locations')

    site.value = settingsResponse.settings
    locations.value = locationsResponse.locations
    menuItemsCount.value = menuResponse.success && menuResponse.menu?.items && Array.isArray(menuResponse.menu.items) ? menuResponse.menu.items.length : 0
    reviewCount.value = googleResponse.reviews ? googleResponse.reviews.length : 0
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load dashboard data'
  } finally {
    loading.value = false
  }
}

onMounted(loadSiteData)

useSeoMeta({ title: 'Site Overview | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
