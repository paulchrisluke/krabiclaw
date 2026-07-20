<template>
  <UCard :class="destructive ? 'border-error/40' : ''">
    <template #header>
      <h3 :class="['text-base font-semibold', destructive ? 'text-error' : 'text-highlighted']">
        {{ title }}
      </h3>
      <p v-if="description" class="mt-1 text-sm text-muted">{{ description }}</p>
    </template>

    <div class="space-y-4">
      <slot />
    </div>

    <template v-if="$slots.footer" #footer>
      <div :class="['flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', destructive ? 'border-t border-error/20 pt-4' : '']">
        <slot name="footer" />
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
interface DashboardSettingsSectionProps {
  title: string
  description?: string
  destructive?: boolean
}

withDefaults(defineProps<DashboardSettingsSectionProps>(), {
  description: undefined,
  destructive: false,
})

defineSlots<{
  default(): unknown
  footer(): unknown
}>()
</script>
