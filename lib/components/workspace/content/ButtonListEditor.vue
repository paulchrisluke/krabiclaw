<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm font-medium text-highlighted">{{ label }}</p>
      <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="xs" @click="add">Add button</UButton>
    </div>
    <div v-for="(button, index) in buttons" :key="buttonKey(button, index)" class="grid gap-3 rounded-lg border border-default p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <UFormField label="Label"><UInput :model-value="field(index, 'label')" @update:model-value="update(index, 'label', $event)" /></UFormField>
      <UFormField label="URL"><UInput :model-value="field(index, 'url')" placeholder="/contact or https://..." @update:model-value="update(index, 'url', $event)" /></UFormField>
      <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="Remove button" class="self-end" @click="remove(index)" />
    </div>
    <p v-if="!buttons.length" class="rounded-lg border border-dashed border-default p-3 text-sm text-muted">No buttons configured.</p>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  buttons: Array<Record<string, unknown>>
  label?: string
}>(), { label: 'Buttons' })

const emit = defineEmits<{ update: [buttons: Array<Record<string, unknown>>] }>()

function buttonKey(button: Record<string, unknown>, index: number) {
  return typeof button.id === 'string' && button.id ? button.id : `${index}-${String(button.label ?? '')}`
}

function field(index: number, key: string): string {
  const value = props.buttons[index]?.[key]
  return value == null ? '' : String(value)
}

function update(index: number, key: string, value: unknown) {
  const buttons = props.buttons.map((button, buttonIndex) => buttonIndex === index ? { ...button, [key]: value == null ? '' : String(value) } : { ...button })
  emit('update', buttons)
}

function add() {
  emit('update', [...props.buttons.map(button => ({ ...button })), { label: '', url: '' }])
}

function remove(index: number) {
  emit('update', props.buttons.filter((_, buttonIndex) => buttonIndex !== index).map(button => ({ ...button })))
}
</script>
