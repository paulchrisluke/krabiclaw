<template>
  <UPage>
    <UPageHeader :title="itemName || (itemId ? 'Menu item' : 'New item')" description="Edit media, ingredients, dietary notes, and serving details.">
      <template #links>
        <UButton color="neutral" variant="ghost" icon="i-heroicons-arrow-left" :to="backPath">
          Menu
        </UButton>
      </template>
    </UPageHeader>

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

const siteId = typeof route.params.siteId === 'string' ? route.params.siteId : ''
const itemId = typeof route.params.itemId === 'string' ? route.params.itemId : ''
const menuId = computed(() => typeof route.query.menuId === 'string' ? route.query.menuId : '')
const locationId = computed(() => typeof route.query.locationId === 'string' ? route.query.locationId : null)
const defaultCurrency = ref('THB')
const itemName = ref('')

if (!siteId || !itemId) {
  throw createError({ statusCode: 400, statusMessage: 'Invalid menu item route' })
}

const { menuPath } = useDashboardSiteLinks(siteId)
const backPath = computed(() => menuPath(locationId.value))

const pageError = computed(() => menuId.value ? null : 'Menu ID is required to edit an item')

onMounted(async () => {
  try {
    const response = await $fetch<{ success: boolean; settings: { default_currency?: string } }>(`/api/sites/${siteId}/settings`)
    if (response.success) defaultCurrency.value = response.settings?.default_currency || 'THB'
  } catch {
    defaultCurrency.value = 'THB'
  }
})

useSeoMeta({ title: computed(() => `${itemName.value || 'Menu Item'} | KrabiClaw Dashboard`), robots: 'noindex, nofollow' })
</script>
