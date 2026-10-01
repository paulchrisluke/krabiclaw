<template>
  <!--
    Attributes as rows: each definition previews this product's value and opens
    its own leaf. A definition is made once, so it means the same thing on
    every product.
  -->
  <DashboardIndexPanel id="product-attributes" :title="p.sectionLabels['attributes']">
    <p v-if="p.ready.value && !p.definitions.value.length" class="text-base text-muted">
      No attributes are defined yet. Define one in your catalog settings and it becomes available on every {{ p.presentation.value.itemLabel.toLowerCase() }}.
    </p>
    <EditorNavigationList v-else :groups="groups" :active-item="level.child.value" />
  </DashboardIndexPanel>
</template>

<script setup lang="ts">
import EditorNavigationList, { type EditorNavigationGroup } from '~/components/dashboard/EditorNavigationList.vue'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'
import type { MetafieldDefinition } from '~/shared/metafields'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
const level = useRouteLevel()

function valueSummary(definition: MetafieldDefinition): string {
  if (definition.value_type === 'boolean') return p.booleanValue(definition) ? 'Yes' : 'No'
  if (definition.value_type === 'list.single_line_text') return p.listValue(definition).join(', ')
  if (definition.value_type === 'integer') return p.integerValue(definition)?.toString() ?? ''
  return p.textValue(definition)
}

const groups = computed<EditorNavigationGroup[]>(() => [{
  id: 'attributes',
  items: p.definitions.value.map((definition) => {
    const summary = valueSummary(definition)
    return { id: definition.id, label: definition.name, summary: summary || undefined, to: `${level.path.value}/${definition.id}` }
  }),
}])
</script>
