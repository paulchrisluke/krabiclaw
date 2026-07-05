<template>
  <UPage>

    <UPageBody>
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
    </UPageBody>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()

const siteId = await useDashboardSiteId()
const menuId = computed(() => typeof route.query.menuId === 'string' ? route.query.menuId : '')
const locationId = computed(() => typeof route.query.locationId === 'string' ? route.query.locationId : null)
const section = computed(() => typeof route.query.section === 'string' ? route.query.section : null)
const defaultCurrency = ref('THB')

if (!siteId) {
  throw createError({
    statusCode: 400,
    statusMessage: 'Invalid site ID'
  })
}

const { menuPath } = useDashboardSiteLinks(siteId)
const _backPath = computed(() => menuPath(locationId.value))

const pageError = computed(() => menuId.value ? null : 'Menu ID is required to create an item')

onMounted(async () => {
  try {
    const response = await $fetch<{ success: boolean; settings: { default_currency?: string } }>(`/api/dashboard/settings`)
    if (response.success) defaultCurrency.value = response.settings?.default_currency || 'THB'
  } catch {
    defaultCurrency.value = 'THB'
  }
})

useSeoMeta({ title: 'Create Menu Item | KrabiClaw Dashboard', robots: 'noindex, nofollow' })
</script>
