<template>
  <div
    class="tenant-layout saya-theme min-h-screen flex flex-col font-sans bg-default text-default"
    :style="brandColor ? { '--ui-primary': brandColor, '--color-primary': brandColor } : {}"
  >
    <UTheme :ui="{}" :props="{ button: { color: 'neutral' } }">
      <SayaHeader />
      <main class="grow">
        <slot />
      </main>
      <SayaFooter />
      <SayaUpgradeModal />
    </UTheme>
  </div>
</template>

<script setup>
const { siteId } = useTenantSite()

const { data: siteConfig } = await useFetch(
  `/api/public/sites/${siteId}/config`,
  { default: () => ({ config: {} }) }
)

const brandColor = computed(() => siteConfig.value?.config?.brand_color || null)
</script>

<style>
/* Tenant-specific base styles can go here */
</style>
