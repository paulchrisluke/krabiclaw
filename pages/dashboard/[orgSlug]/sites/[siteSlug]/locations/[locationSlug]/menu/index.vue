<template>
  <UDashboardPanel id="location-menu">
    <template #header>
      <UDashboardNavbar title="Menu">
        <template #leading>
          <DashboardSidebarCollapseButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="loading" class="space-y-4">
        <USkeleton class="h-10 w-56" />
        <USkeleton class="h-48 w-full" />
        <USkeleton class="h-48 w-full" />
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :description="error"
      />

      <UCard v-else-if="locations.length === 0">
        <div class="mx-auto max-w-md py-10 text-center">
          <UIcon name="i-lucide-map-pin" class="mx-auto size-10 text-muted" />
          <h2 class="mt-4 text-xl font-semibold text-highlighted">Add a location first</h2>
          <p class="mt-2 text-sm text-muted">Menus are managed per physical location.</p>
          <UButton class="mt-6" :to="paths.locations" icon="i-lucide-plus" color="primary">
            Add Location
          </UButton>
        </div>
      </UCard>

      <div v-else-if="selectedLocation">
        <MenuEditor
          :key="selectedLocation.id"
          :site-id="siteId"
          :location-id="selectedLocation.id"
          :default-currency="defaultCurrency"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

interface BusinessLocation {
  id: string
  slug: string
  title: string
  is_primary: boolean
}

const siteId = await useDashboardSiteId()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()

if (!siteId) {
  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid site ID'
  })
}

const loading = ref(true)
const error = ref<string | null>(null)
const defaultCurrency = ref('THB')
const { paths } = useDashboardSiteLinks(siteId)
const locations = computed(() => dashboard.locations.value as BusinessLocation[])

const selectedLocation = computed(() => dashboardLocation.currentLocation.value)

const loadMenuWorkspace = async () => {
  loading.value = true
  try {
    defaultCurrency.value = (await fetchMenuCurrency()) ?? defaultCurrency.value
  } finally {
    loading.value = false
  }
}

onMounted(loadMenuWorkspace)

useSeoMeta({ title: 'Menu | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
