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
              <h2 class="mt-4 text-2xl font-semibold text-(--ui-text-highlighted)">Add your first location</h2>
              <p class="mt-2 max-w-2xl text-sm text-(--ui-text-muted)">
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

        <div v-else class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-4">
                <div>
                  <h2 class="font-semibold text-(--ui-text-highlighted)">Locations</h2>
                  <p class="mt-1 text-sm text-(--ui-text-muted)">Choose a location to edit local content, menu, details, and Google Business data.</p>
                </div>
                <UButton
                  :to="`/dashboard/sites/${siteId}/settings?tab=locations`"
                  icon="i-heroicons-plus"
                  color="neutral"
                  variant="soft"
                >
                  Add
                </UButton>
              </div>
            </template>

            <div class="divide-y divide-(--ui-border)">
              <NuxtLink
                v-for="location in locations"
                :key="location.id"
                :to="`/dashboard/sites/${siteId}/locations/${location.id}`"
                class="group flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="truncate font-medium text-(--ui-text-highlighted)">{{ location.title }}</p>
                    <UBadge v-if="location.is_primary" color="primary" variant="soft" size="xs">Primary</UBadge>
                    <UBadge :color="location.status === 'active' ? 'success' : 'warning'" variant="soft" size="xs">
                      {{ location.status }}
                    </UBadge>
                  </div>
                  <p class="mt-1 truncate text-sm text-(--ui-text-muted)">{{ addressLabel(location) || location.city || `/${location.slug}` }}</p>
                </div>
                <UIcon name="i-heroicons-arrow-right" class="size-5 shrink-0 text-(--ui-text-muted) transition group-hover:text-(--ui-primary)" />
              </NuxtLink>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <h2 class="font-semibold text-(--ui-text-highlighted)">Next Actions</h2>
            </template>

            <div class="space-y-2">
              <UButton
                :to="`/dashboard/sites/${siteId}/locations/${primaryLocation?.id || locations[0]?.id}`"
                icon="i-heroicons-map-pin"
                block
              >
                Open Location
              </UButton>
              <UButton
                :to="{ path: `/dashboard/sites/${siteId}/content`, query: { locationId: primaryLocation?.id || locations[0]?.id, page: 'location' } }"
                icon="i-heroicons-document-text"
                color="neutral"
                variant="soft"
                block
              >
                Edit Local Content
              </UButton>
              <UButton
                :to="{ path: `/dashboard/sites/${siteId}/menu`, query: { locationId: primaryLocation?.id || locations[0]?.id } }"
                icon="i-heroicons-list-bullet"
                color="neutral"
                variant="soft"
                block
              >
                Edit Local Menu
              </UButton>
            </div>
          </UCard>
        </div>

        <div class="grid gap-4 md:grid-cols-3">
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">Locations</p>
            <p class="mt-2 text-3xl font-semibold text-(--ui-text-highlighted)">{{ locations.length }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">Menu items</p>
            <p class="mt-2 text-3xl font-semibold text-(--ui-text-highlighted)">{{ menuItemsCount }}</p>
          </UCard>
          <UCard>
            <p class="text-sm text-(--ui-text-muted)">Reviews</p>
            <p class="mt-2 text-3xl font-semibold text-(--ui-text-highlighted)">{{ reviewCount }}</p>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <h2 class="font-semibold text-(--ui-text-highlighted)">Site Details</h2>
              <UBadge :color="site.status === 'active' ? 'success' : 'warning'" variant="soft">{{ site.status }}</UBadge>
            </div>
          </template>

          <dl class="grid gap-4 md:grid-cols-2">
            <div>
              <dt class="text-sm text-(--ui-text-muted)">Website address</dt>
              <dd class="mt-1 font-medium text-(--ui-text-highlighted)">{{ site.subdomain }}.{{ platformHostname }}</dd>
            </div>
            <div>
              <dt class="text-sm text-(--ui-text-muted)">Theme</dt>
              <dd class="mt-1 font-medium text-(--ui-text-highlighted)">Saya</dd>
            </div>
            <div>
              <dt class="text-sm text-(--ui-text-muted)">Plan</dt>
              <dd class="mt-1 flex items-center gap-2 font-medium text-(--ui-text-highlighted)">
                {{ site.plan === 'free' ? 'Free' : 'Premium' }}
                <UBadge :color="site.plan === 'free' ? 'neutral' : 'primary'" variant="soft" size="xs">
                  {{ site.plan === 'free' ? 'Limited' : 'Full access' }}
                </UBadge>
              </dd>
            </div>
            <div>
              <dt class="text-sm text-(--ui-text-muted)">Launch readiness</dt>
              <dd class="mt-1 font-medium text-(--ui-text-highlighted)">
                {{ launchReadiness?.overall_ready ? 'Ready' : 'Needs attention' }}
              </dd>
            </div>
          </dl>
        </UCard>
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
    const [settingsResponse, launchResponse, locationsResponse, menuResponse, googleResponse] = await Promise.all([
      $fetch<any>(`/api/sites/${siteId}/settings`),
      $fetch<any>(`/api/sites/${siteId}/launch-readiness`),
      $fetch<any>(`/api/sites/${siteId}/locations`),
      $fetch<any>(`/api/public/sites/${siteId}/menus`),
      $fetch<any>(`/api/public/sites/${siteId}/google-business`)
    ])

    if (!settingsResponse.success) throw new Error('Failed to load site settings')
    if (!locationsResponse.success) throw new Error('Failed to load locations')

    site.value = settingsResponse.settings
    launchReadiness.value = launchResponse.success ? launchResponse.launch_readiness : null
    locations.value = locationsResponse.locations
    menuItemsCount.value = menuResponse.success && menuResponse.menu ? menuResponse.menu.items.length : 0
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
