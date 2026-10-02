<template>
  <DashboardIndexPanel id="organization-products" :title="presentation.collectionLabel">
    <UAlert v-if="error" color="error" :title="`${presentation.collectionLabel} could not be loaded`" :description="error.message" />
    <p v-else-if="pending">Loading {{ presentation.collectionLabel }}…</p>
    <template v-else>
      <UButton :to="`${basePath}/new/name`" :label="`Add ${presentation.itemLabel}`" class="mb-6" />
      <EditorNavigationList :groups="groups" />
      <p v-if="!data?.products.length" class="text-muted">No {{ presentation.itemLabelPlural }} have been created.</p>
    </template>
  </DashboardIndexPanel>
</template>
<script setup lang="ts">
import type { Product } from '~/server/types/products'
import EditorNavigationList from '~/components/dashboard/EditorNavigationList.vue'
import { requireProductPresentation } from '~/utils/product-presentation'
const organizationId = await useDashboardOrganizationId()
const api = useDashboardApi()
const route = useRoute()
const dashboard = useDashboardOrganization()
const presentation = computed(() => requireProductPresentation(dashboard.organization.value?.vertical, dashboard.organization.value?.theme_id))
const basePath = computed(() => `/dashboard/${String(route.params.orgSlug)}/products`)
const { data, pending, error } = await useAsyncData(`organization-products:${organizationId}`, () => api<{ products: Product[] }>(`/api/editor/organizations/${organizationId}/products`, { validate: (value): value is { products: Product[] } => isRecord(value) && Array.isArray(value.products) }))
const groups = computed(() => [{ id: 'products', label: presentation.value.collectionLabel, items: (data.value?.products ?? []).map(product => ({ id: product.id, label: product.name, to: `${basePath.value}/${product.id}`, summary: product.booking?.online_timezone ? 'Online appointments' : product.booking ? 'Bookings' : presentation.value.itemLabel })) }])
definePageMeta({ layout: 'dashboard' })
</script>
