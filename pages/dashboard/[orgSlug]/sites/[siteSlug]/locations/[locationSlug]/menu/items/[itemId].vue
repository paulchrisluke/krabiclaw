<template>
  <UDashboardPanel id="location-menu-item">
    <template #header>
      <UDashboardNavbar :title="itemName || 'Menu Item'">
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
        :item-id="itemId"
        :location-id="locationId"
        :default-currency="defaultCurrency"
        @update:item-name="itemName = $event"
      />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()

const siteId = await useDashboardSiteId()
const dashboardLocation = useDashboardLocation()
const itemId = typeof route.params.itemId === 'string' ? route.params.itemId : ''
const menuId = computed(() => typeof route.query.menuId === 'string' ? route.query.menuId : '')
const locationId = computed(() => dashboardLocation.currentLocationId.value)
const defaultCurrency = ref('THB')
const itemName = ref('')

if (!siteId || !itemId) {
  throw createError({ statusCode: 400, statusMessage: 'Invalid menu item route' })
}

const { menuPath } = useDashboardSiteLinks(siteId)
const _backPath = computed(() => menuPath())

const pageError = computed(() => menuId.value ? null : 'Menu ID is required to edit an item')

onMounted(async () => {
  defaultCurrency.value = (await fetchMenuCurrency()) ?? defaultCurrency.value
})

useSeoMeta({ title: computed(() => `${itemName.value || 'Menu Item'} | KrabiClaw Dashboard`), robots: 'noindex, nofollow' })
</script>
