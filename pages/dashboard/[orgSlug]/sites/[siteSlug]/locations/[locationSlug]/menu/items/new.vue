<template>
  <UDashboardPanel id="location-menu-item-new">
    <template #header>
      <UDashboardNavbar title="New Menu Item">
        <template #leading>
          <DashboardSidebarCollapseButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="pageError"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :description="pageError"
      />
      <MenuItemDetailEditor
        v-else-if="menuId"
        :site-id="siteId"
        :menu-id="menuId"
        :location-id="locationId"
        :initial-section="section"
        :default-currency="defaultCurrency"
      />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.menu' })

const route = useRoute()

const siteId = await useDashboardSiteId()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
const menuId = computed(() => typeof route.query.menuId === 'string' ? route.query.menuId : '')
const locationId = computed(() => dashboardLocation.currentLocationId.value)
const section = computed(() => typeof route.query.section === 'string' ? route.query.section : null)
const defaultCurrency = computed(() => dashboard.site.value?.default_currency ?? '')

if (!siteId) {
  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid site ID'
  })
}

const { menuPath } = useDashboardSiteLinks(siteId)
const _backPath = computed(() => menuPath())

const pageError = computed(() => menuId.value ? null : 'Menu ID is required to create an item')

useSeoMeta({ title: 'Create Menu Item | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
