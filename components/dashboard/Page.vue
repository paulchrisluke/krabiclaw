<template>
  <UDashboardPanel :id="id">
    <template #header>
      <UDashboardNavbar :title="title">
        <template v-if="description" #left>
          <span class="hidden text-sm text-muted sm:inline">{{ description }}</span>
        </template>
        <template v-if="$slots.actions" #right>
          <slot name="actions" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar v-if="$slots.toolbar">
        <slot name="toolbar" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div :class="['mx-auto w-full', widthClass, padded ? 'p-4 sm:p-6' : '']">
        <slot />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
interface DashboardPageProps {
  id: string
  title: string
  description?: string
  width?: 'narrow' | 'default' | 'wide' | 'full'
  padded?: boolean
}

const props = withDefaults(defineProps<DashboardPageProps>(), {
  description: undefined,
  width: 'default',
  padded: true,
})

defineSlots<{
  default(): unknown
  actions(): unknown
  toolbar(): unknown
}>()

const widthClass = computed(() => {
  switch (props.width) {
    case 'narrow': return 'max-w-3xl'
    case 'wide': return 'max-w-7xl'
    case 'full': return 'max-w-none'
    default: return 'max-w-5xl'
  }
})
</script>
