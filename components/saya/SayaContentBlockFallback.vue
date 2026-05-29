<template>
  <div class="content-block-fallback border border-dashed border-default bg-muted/50 p-6 rounded-lg">
    <div class="flex items-start gap-3">
      <UIcon name="i-heroicons-exclamation-triangle" class="size-5 text-muted mt-0.5" />
      <div class="flex-1">
        <p class="text-sm font-medium text-muted mb-1">Unknown component</p>
        <p class="text-xs text-muted">
          Component "{{ componentName }}" is not registered. Please check the component name or add it to the registry.
        </p>
        <p v-if="import.meta.dev" class="mt-2 text-xs text-muted/60">
          Field: {{ data?.field }} | Page: {{ data?.page }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  componentName: string
  data?: {
    field?: string
    page?: string
    [key: string]: unknown
  }
}

defineProps<Props>()
</script>
