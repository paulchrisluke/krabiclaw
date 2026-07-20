<template>
  <UCard>
    <div class="flex items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate text-sm text-muted">{{ label }}</p>
        <p class="mt-1 text-2xl font-semibold text-highlighted">{{ value }}</p>
        <p v-if="detail" class="mt-1 truncate text-xs text-dimmed">{{ detail }}</p>
      </div>
      <UIcon v-if="icon" :name="icon" class="size-8 shrink-0 text-dimmed" />
    </div>
  </UCard>
</template>

<script setup lang="ts">
interface DashboardStatProps {
  label: string
  value: string | number
  icon?: string
  detail?: string
}

withDefaults(defineProps<DashboardStatProps>(), {
  icon: undefined,
  detail: undefined,
})
</script>
