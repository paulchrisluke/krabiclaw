<template>
  <UDashboardPanel id="location-menu-item">
    <template #header>
      <UDashboardNavbar :title="itemName || 'Menu Item'">
        <template #leading>
          <DashboardNavbarLeading :detail-to="backPath" detail-label="Menu" />
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
        ref="editorRef"
        :site-id="siteId"
        :menu-id="menuId"
        :item-id="itemId"
        :location-id="locationId"
        :default-currency="defaultCurrency"
        @update:item-name="itemName = $event"
      />
    </template>

    <template v-if="editorRef" #footer>
      <DashboardFooterActionBar>
        <template v-if="editorRef.itemId" #leading>
          <UButton
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            square
            aria-label="Delete item"
            :loading="editorRef.deleting"
            @click="editorRef.handleDelete"
          />
        </template>
        <UButton color="neutral" variant="ghost" :to="backPath">Cancel</UButton>
        <UButton :loading="editorRef.saving" :disabled="!editorRef.canSave" @click="editorRef.handleSave">
          {{ editorRef.itemId ? 'Save item' : 'Create item' }}
        </UButton>
      </DashboardFooterActionBar>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard', cmsCapabilityKey: 'location.menu', mobileBottomNav: false })

const route = useRoute()
const editorRef = useTemplateRef('editorRef')

const siteId = await useDashboardSiteId()
const dashboard = useDashboardSite()
const dashboardLocation = useDashboardLocation()
const itemId = typeof route.params.itemId === 'string' ? route.params.itemId : ''
const menuId = computed(() => typeof route.query.menuId === 'string' ? route.query.menuId : '')
const locationId = computed(() => dashboardLocation.currentLocationId.value)
const defaultCurrency = computed(() => dashboard.site.value?.default_currency ?? '')
const itemName = ref('')

if (!siteId || !itemId) {
  throw createError({ statusCode: 400, statusMessage: 'Invalid menu item route' })
}

const { menuPath } = useDashboardSiteLinks(siteId)
const backPath = computed(() => menuPath(locationId.value))

const pageError = computed(() => menuId.value ? null : 'Menu ID is required to edit an item')

useSeoMeta({ title: computed(() => `${itemName.value || 'Menu Item'} | KrabiClaw Dashboard`), robots: 'noindex, nofollow' })
</script>
