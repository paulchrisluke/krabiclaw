<template>
  <!--
    Options as a list: each option is a row previewing its values and opening
    its own leaf, and each combination a customer can buy is a row carrying its
    price (DESIGN.md: a pane that would need many fields becomes an index).
  -->
  <DashboardIndexPanel id="product-options" :title="p.sectionLabels['options']">
    <EditorNavigationList :groups="groups" :active-item="activeItem" @act="act" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { PRODUCT_LIMITS } from '~/shared/product-limits'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
const level = useRouteLevel()
const route = useRoute()

const groups = computed<EditorNavigationGroup[]>(() => [
  {
    id: 'options',
    items: [
      ...p.form.options.map((option, index) => ({
        id: `option-${index}`,
        label: option.name || 'Option',
        summary: option.values.map(value => value.value).join(', ') || undefined,
        to: `${level.path.value}/${index}`,
      })),
      ...(p.form.options.length < PRODUCT_LIMITS.options ? [{ id: 'add', label: 'Add an option', action: {} }] : []),
    ],
  },
  ...(p.form.variants.length > 1
    ? [{
        id: 'combinations',
        label: 'Combinations',
        items: p.form.variants.map(variant => ({
          id: `price-${variant.key}`,
          label: variant.name,
          summary: variant.price_major ? `${variant.price_major} ${p.currency}` : undefined,
          to: `${level.path.value}/prices/${encodeURIComponent(variant.key)}`,
        })),
      }]
    : []),
])

const activeItem = computed(() => {
  if (typeof route.params.optionIndex === 'string') return `option-${route.params.optionIndex}`
  if (typeof route.params.variantKey === 'string') return `price-${route.params.variantKey}`
  return null
})

// Adding an option is a draft until its own leaf saves it.
function act(id: string) {
  if (id !== 'add') return
  p.addOption()
  void navigateTo(`${level.path.value}/${p.form.options.length - 1}`)
}
</script>
