<template>
  <!-- One option: what it is called and the values a customer picks between. -->
  <DashboardLeafPanel
    id="product-option"
    :ready="p.ready.value && Boolean(option)"
    :title="option?.name || 'Option'"
    :saving="p.saving.value"
    :disabled="p.saveDisabled.value"
    :save-label="p.saveLabel.value"
    :error="removeError || p.saveError.value || ''"
    @cancel="p.revert"
    @save="p.save(level.to.value ?? undefined)"
  >
    <div v-if="option && !removing" class="space-y-6">
      <UFormField label="Option name">
        <UInput v-model="option.name" placeholder="Size" :maxlength="PRODUCT_LIMITS.optionName" autofocus class="w-full" />
      </UFormField>
      <UInputTags
          :model-value="option.values.map(value => value.value)"
          placeholder="Add a value"
          :max="PRODUCT_LIMITS.optionValues"
          :max-length="PRODUCT_LIMITS.optionValue"
          delimiter=","
          add-on-blur
          add-on-paste
          class="w-full"
          aria-label="Option values"
          @update:model-value="p.setOptionValues(index, $event as string[])"
        />
      <UButton color="error" variant="soft" icon="i-lucide-trash-2" :label="`Remove ${option.name || 'option'}`" :loading="p.saving.value" @click="remove" />
    </div>
  </DashboardLeafPanel>
</template>

<script setup lang="ts">
import { PRODUCT_LIMITS } from '~/shared/product-limits'
import { productEditorKey } from '~/components/dashboard/ProductEditorPage.vue'

definePageMeta({ layout: 'dashboard' })

const p = inject(productEditorKey)!
const route = useRoute()
const level = useRouteLevel()
const index = computed(() => Number(route.params.optionIndex))
const option = computed(() => p.form.options[index.value] ?? null)

// An option the product does not have is not a page (DESIGN.md).
// Removing it empties this leaf on purpose, on the way back to the list.
const removing = ref(false)
watchEffect(() => {
  if (p.ready.value && !option.value && !removing.value) showError(createError({ statusCode: 404, statusMessage: 'Option not found' }))
})

const removeError = ref('')
// Removing commits, because the list it leaves has no Save of its own. A new
// product has nothing to commit yet, so its draft just loses the option.
async function remove() {
  removeError.value = ''
  removing.value = true
  const options = [...p.form.options]
  const variants = [...p.form.variants]
  p.removeOption(index.value)
  if (!p.isNew.value) {
    if (p.saveDisabled.value) {
      removeError.value = 'Every option needs a name and at least one value before this can be saved.'
      p.form.options = options
      p.form.variants = variants
      removing.value = false
      return
    }
    // A refused save stays here with its reason; Cancel puts the option back.
    await p.save(level.to.value ?? undefined)
    if (p.saveError.value) {
      p.form.options = options
      p.form.variants = variants
      removing.value = false
    }
    return
  }
  await navigateTo(level.to.value ?? '/dashboard')
}
</script>
