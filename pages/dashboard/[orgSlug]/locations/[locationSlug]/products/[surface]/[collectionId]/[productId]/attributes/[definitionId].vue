<template>
  <!-- One attribute, edited in its own type: a number typed into a text box arrives as a string the validator refuses. -->
  <DashboardLeafPanel
    id="product-attribute"
    :ready="p.ready.value && Boolean(definition)"
    :title="definition?.name ?? ''"
    :lead="definition?.description ?? undefined"
    :saving="p.saving.value"
    :disabled="p.saveDisabled.value"
    :save-label="p.saveLabel.value"
    :error="p.saveError.value || ''"
    @cancel="p.revert"
    @save="p.save(level.to.value ?? undefined)"
  >
    <template v-if="definition">
      <SettingRow
        v-if="definition.value_type === 'boolean'"
        :model-value="p.booleanValue(definition)"
        :label="definition.name"
        @update:model-value="p.form.metafields[p.metafieldKey(definition)] = $event"
      />
      <UInputTags
        v-else-if="definition.value_type === 'list.single_line_text'"
        :model-value="p.listValue(definition)"
        placeholder="Add a value"
        delimiter=","
        add-on-blur
        add-on-paste
        :aria-label="definition.name"
        class="w-full"
        @update:model-value="p.form.metafields[p.metafieldKey(definition)] = $event as string[]"
      />
      <UTextarea v-else-if="definition.value_type === 'multi_line_text'" :model-value="p.textValue(definition)" :rows="4" :aria-label="definition.name" autofocus class="w-full" @update:model-value="p.form.metafields[p.metafieldKey(definition)] = $event" />
      <UInputNumber v-else-if="definition.value_type === 'integer'" :model-value="p.integerValue(definition)" :aria-label="definition.name" class="w-full" @update:model-value="p.setIntegerMetafield(definition, $event)" />
      <UInput v-else :model-value="p.textValue(definition)" :aria-label="definition.name" autofocus class="w-full" @update:model-value="p.form.metafields[p.metafieldKey(definition)] = $event" />
    </template>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import SettingRow from '~/components/dashboard/SettingRow.vue'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
const route = useRoute()
const level = useRouteLevel()
const definition = computed(() => p.definitions.value.find(entry => entry.id === String(route.params.definitionId)) ?? null)

// An attribute this catalog does not define is not a page (DESIGN.md).
watchEffect(() => {
  if (p.ready.value && !definition.value) showError(createError({ statusCode: 404, statusMessage: 'Page not found' }))
})
</script>
