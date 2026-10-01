<template>
  <DashboardIndexPanel id="organization-products" title="Products">
    <UAlert v-if="error" color="error" title="Products could not be loaded" :description="error.message" />
    <p v-else-if="pending">Loading Products…</p>
    <template v-else>
      <UButton :to="`${basePath}/new/name`" label="Add Product" class="mb-6" />
      <EditorNavigationList :groups="groups" />
      <p v-if="!data?.products.length" class="text-muted">No Products have been created.</p>
    </template>
  </DashboardIndexPanel>
</template>
<script setup lang="ts">
import type { Product } from '~/server/types/products'
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
const organizationId = await useDashboardOrganizationId()
const api = useDashboardApi()
const route = useRoute()
const basePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/products`)
const { data, pending, error } = await useAsyncData(`organization-products:${organizationId}`, () => api<{ products: Product[] }>(`/api/editor/organizations/${organizationId}/products`, { validate: (value): value is { products: Product[] } => isRecord(value) && Array.isArray(value.products) }))
const groups = computed(() => [{ id: 'products', label: 'Products', items: (data.value?.products ?? []).map(product => ({ id: product.id, label: product.name, to: `${basePath.value}/${product.id}`, summary: product.booking?.online_timezone ? 'Online appointments' : product.booking ? 'Bookings' : 'Product' })) }])
definePageMeta({ layout: 'dashboard' })
</script>
