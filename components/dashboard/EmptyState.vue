<template>
  <UEmpty :icon="icon" :title="title" :description="description">
    <template v-if="$slots.actions" #actions>
      <slot name="actions" />
    </template>
  </UEmpty>
</template>

<script setup lang="ts">
interface DashboardEmptyStateProps {
  icon?: string
  title: string
  description?: string
}

withDefaults(defineProps<DashboardEmptyStateProps>(), {
  icon: undefined,
  description: undefined,
})

defineSlots<{
  actions(): unknown
}>()
</script>
