<template>
  <DashboardLeafPanel id="service-page-booking" title="Appointment booking" :ready="editor.ready.value && !pending" :saving="editor.saving.value" :disabled="editor.saveDisabled.value" :save-label="editor.saveLabel.value" :error="editor.errorMessage.value || loadError" @cancel="editor.revert" @save="editor.save">
    <UFormField label="Consultation Product" description="Link the Product that supplies this service’s duration, prices and appointment schedule. The service page keeps its existing content and images.">
      <USelect v-model="selectedProduct" :items="items" class="w-full" aria-label="Consultation Product" />
    </UFormField>
  </DashboardLeafPanel>
</template>
<script setup lang="ts">
import { tenantPageEditorKey } from '~/components/dashboard/TenantPageEditorPage.vue'
import type { Product } from '~/server/types/products'
import { isPublicProduct } from '~/utils/public-resource-contracts'
import { isRecord } from '~/utils/api-clients'
import { getErrorMessage } from '~/utils/errors'
definePageMeta({ layout: 'dashboard' })
const editor = inject(tenantPageEditorKey)!
const organizationId = await useDashboardOrganizationId()
const api = useDashboardApi()
const { data, error, pending } = await useAsyncData(`service-page-product-options:${organizationId}`, () => api<{ products: Product[] }>(`/api/editor/organizations/${organizationId}/products`, { validate: (value): value is { products: Product[] } => isRecord(value) && Array.isArray(value.products) && value.products.every(isPublicProduct) }))
const loadError = computed(() => error.value ? getErrorMessage(error.value, 'Products could not be loaded') : '')
const selectedProduct = computed({ get: () => editor.draft.value.product_id ?? 'none', set: value => { editor.draft.value.product_id = value === 'none' ? null : value } })
const items = computed(() => [{ label: 'No appointment booking', value: 'none' }, ...(data.value?.products ?? []).map(product => ({ label: product.name, value: product.id }))])
</script>
