<template>
  <UPage>

    <UPageBody>
      <UAlert
        v-if="pageError"
        color="error"
        variant="soft"
        icon="i-heroicons-exclamation-triangle"
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
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()

const siteId = await useDashboardSiteId()
const itemId = typeof route.params.itemId === 'string' ? route.params.itemId : ''
const menuId = computed(() => typeof route.query.menuId === 'string' ? route.query.menuId : '')
const locationId = computed(() => typeof route.query.locationId === 'string' ? route.query.locationId : null)
const defaultCurrency = ref('THB')
const itemName = ref('')

if (!siteId || !itemId) {
  throw createError({ statusCode: 400, statusMessage: 'Invalid menu item route' })
}

const { menuPath } = useDashboardSiteLinks(siteId)
const _backPath = computed(() => menuPath(locationId.value))

const pageError = computed(() => menuId.value ? null : 'Menu ID is required to edit an item')

onMounted(async () => {
  try {
    const response = await $fetch<{ success: boolean; settings: { default_currency?: string } }>(`/api/dashboard/settings`)
    if (response.success) defaultCurrency.value = response.settings?.default_currency || 'THB'
  } catch {
    defaultCurrency.value = 'THB'
  }
})

useSeoMeta({ title: computed(() => `${itemName.value || 'Menu Item'} | KrabiClaw Dashboard`), robots: 'noindex, nofollow' })
</script>
