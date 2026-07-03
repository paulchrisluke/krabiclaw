<template>
  <div class="content-block-fallback border border-dashed border-default bg-muted/50 p-6 rounded-lg">
    <div class="flex items-start gap-3">
      <svg viewBox="0 0 24 24" class="size-5 text-muted mt-0.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0zM12 15.75h.007v.008H12z"/></svg>
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
