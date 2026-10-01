<template>
  <NuxtLayout :name="isPlatform ? 'platform' : 'saya'">
    <TenantPublicPage v-if="isPlatform" :path="documentPath" />
    <TenantProductCatalog v-else />
  </NuxtLayout>
</template>

<script setup lang="ts">
import TenantProductCatalog from '~/components/products/TenantProductCatalog.vue'
definePageMeta({ layout: false })
const { isPlatform } = useTenantOrganization()
const documentPath = useTenantPageDocumentPath('/products', 'path')
</script>
