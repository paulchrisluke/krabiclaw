<template>
  <DashboardLeafPanel
    id="product-attributes"
    :title="p.sectionLabels['attributes']"
    :saving="p.saving.value"
    :disabled="p.saveDisabled.value"
    :save-label="p.saveLabel.value"
    :error="p.saveError.value || p.photoError.value || ''"
    @cancel="p.revert"
    @save="p.save"
  >
    <!-- Attributes are your own defined facts; each is a definition made once, so it means the same thing on every product. -->
    <div class="space-y-3">
      <p v-if="!p.definitions.value.length" class="text-base text-muted">
        No attributes are defined yet. Define one in your catalog settings and it becomes available on every {{ p.presentation.value.itemLabel.toLowerCase() }}.
      </p>
      <UFormField v-for="definition in p.definitions.value" :key="definition.id" :label="definition.name" :description="definition.description ?? undefined">
        <UInputTags
          v-if="definition.value_type === 'list.single_line_text'"
          :model-value="p.listValue(definition)"
          placeholder="Add a value"
          delimiter=","
          add-on-blur
          add-on-paste
          class="w-full"
          @update:model-value="p.form.metafields[p.metafieldKey(definition)] = $event as string[]"
        />
        <UTextarea v-else-if="definition.value_type === 'multi_line_text'" :model-value="p.textValue(definition)" :rows="4" class="w-full" @update:model-value="p.form.metafields[p.metafieldKey(definition)] = $event" />
        <!-- A typed attribute is edited in its own type: a number typed into a text box arrives as a string the validator refuses. -->
        <UInputNumber v-else-if="definition.value_type === 'integer'" :model-value="p.integerValue(definition)" class="w-full" @update:model-value="p.setIntegerMetafield(definition, $event)" />
        <UCheckbox v-else-if="definition.value_type === 'boolean'" :model-value="p.booleanValue(definition)" :label="definition.name" @update:model-value="p.form.metafields[p.metafieldKey(definition)] = $event === true" />
        <UInput v-else :model-value="p.textValue(definition)" class="w-full" @update:model-value="p.form.metafields[p.metafieldKey(definition)] = $event" />
      </UFormField>
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
</script>
