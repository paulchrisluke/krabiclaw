<template>
  <UDashboardPanel :id="id" class="min-h-0">
    <template v-if="showHeader" #header>
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
      <div class="flex h-full min-h-0 flex-col">
        <slot />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
interface DashboardWorkspacePageProps {
  id: string
  title?: string
  description?: string
  showHeader?: boolean
}

withDefaults(defineProps<DashboardWorkspacePageProps>(), {
  title: undefined,
  description: undefined,
  showHeader: true,
})

defineSlots<{
  default(): unknown
  actions(): unknown
  toolbar(): unknown
}>()
</script>
