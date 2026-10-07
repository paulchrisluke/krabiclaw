<template>
  <!--
    The page this product owns, edited by the same page editor Pages uses: its
    sections, title, summary and URL. A product with no page of its own says so
    and offers to make one; nothing is created by opening this.
  -->
  <TenantPageEditorPage v-if="p.product.value?.page" :page-id="p.product.value.page.id" />
  <DashboardIndexPanel v-else id="product-page" :title="p.sectionLabels['page']">
    <UAlert v-if="p.loadError.value" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="p.loadError.value" />
    <div v-else class="rounded-2xl border border-default bg-elevated px-6 py-20 text-center">
      <UIcon name="i-lucide-file-text" class="mx-auto size-6 text-muted" />
      <h2 class="mt-5 text-base font-semibold text-highlighted">No page</h2>
      <UButton class="mt-6" label="Create page" icon="i-lucide-plus" :loading="p.saving.value" @click="p.createPage" />
      <UAlert v-if="p.saveError.value" class="mt-6 text-left" color="error" variant="soft" icon="i-lucide-triangle-alert" :description="p.saveError.value" />
    </div>
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import TenantPageEditorPage from '~/components/dashboard/TenantPageEditorPage.vue'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
const level = useRouteLevel()
// A section of a page this product does not have is not a page.
watchEffect(() => {
  if (p.product.value && !p.loadError.value && !p.product.value.page && level.child.value) showError(createError({ statusCode: 404, statusMessage: 'Page not found' }))
})
</script>
