<template>
  <div v-if="visible" class="fixed bottom-0 left-0 right-0 z-50 border-t border-default bg-default/95 backdrop-blur">
    <div class="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-heroicons-circle-stack" class="size-4" />
          <span>Unsaved changes</span>
        </div>
        <div class="flex items-center gap-2">
          <UButton variant="ghost" color="neutral" size="sm" @click="handleReset">
            Reset
          </UButton>
          <UButton :loading="saving" :disabled="saving" size="sm" @click="handleSave">
            Save
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean
  saving: boolean
}>()

const emit = defineEmits<{
  save: []
  reset: []
}>()

const handleSave = () => emit('save')
const handleReset = () => emit('reset')
</script>
