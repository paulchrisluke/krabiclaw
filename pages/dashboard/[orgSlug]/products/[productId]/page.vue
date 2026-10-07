<template>
  <!--
    Page content for a service that has no page yet. A page is edited in one
    place, Pages; once this product has one, its Page content row opens it
    there. Nothing is created by opening this.
  -->
  <DashboardIndexPanel id="product-page" :title="p.sectionLabels['page']">
    <UAlert v-if="p.loadError.value" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="p.loadError.value" />
    <div v-else-if="p.product.value?.page" class="rounded-2xl border border-default bg-elevated px-6 py-20 text-center">
      <UIcon name="i-lucide-file-text" class="mx-auto size-6 text-muted" />
      <h2 class="mt-5 text-base font-semibold text-highlighted">{{ p.product.value.page.path }}</h2>
      <UButton class="mt-6" label="Edit page content" :to="`/dashboard/${String(route.params.orgSlug)}/website/pages/${encodeURIComponent(p.product.value.page.id)}`" />
    </div>
    <div v-else class="rounded-2xl border border-default bg-elevated px-6 py-20 text-center">
      <UIcon name="i-lucide-file-text" class="mx-auto size-6 text-muted" />
      <h2 class="mt-5 text-base font-semibold text-highlighted">No page</h2>
      <UButton class="mt-6" label="Create page" icon="i-lucide-plus" :loading="p.saving.value" @click="p.createPage" />
      <UAlert v-if="p.saveError.value" class="mt-6 text-left" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="p.saveError.value" />
    </div>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
const route = useRoute()
</script>
