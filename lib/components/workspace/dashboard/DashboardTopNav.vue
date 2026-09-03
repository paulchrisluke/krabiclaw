<template>
  <header
    class="fixed inset-x-0 top-0 z-40 hidden h-(--kc-dashboard-top-nav) items-center gap-4 border-b border-default bg-default px-4 md:grid md:grid-cols-[1fr_auto_1fr] lg:px-8"
    data-testid="dashboard-top-nav"
  >
    <NuxtLink :to="homeTo" class="group flex w-fit shrink-0 items-center gap-2.5 no-underline">
      <img
        src="/krabi-claw-logo-96.webp"
        alt="KrabiClaw"
        width="36"
        height="36"
        class="size-8 rounded-[9px] transition-transform duration-200 group-hover:rotate-12"
      >
      <span class="kc-wordmark hidden text-[19px] lg:inline">
        <span class="kc-wordmark__krabi">krabi</span><span class="kc-wordmark__claw">claw</span>
      </span>
    </NuxtLink>

    <nav class="flex items-center justify-center gap-1" aria-label="Dashboard">
      <NuxtLink
        v-for="item in items"
        :key="item.key"
        :to="item.to"
        class="rounded-full px-3 py-2 text-sm font-medium no-underline transition-colors"
        :class="item.active
          ? 'text-highlighted underline decoration-2 underline-offset-8'
          : 'text-muted hover:text-highlighted'"
        :aria-current="item.active ? 'page' : undefined"
      >
        {{ item.label }}
      </NuxtLink>
    </nav>

    <div class="flex items-center justify-end gap-1">
      <DashboardAccountMenu />
      <UButton
        color="neutral"
        variant="ghost"
        square
        icon="i-lucide-menu"
        aria-label="Open menu"
        data-testid="dashboard-top-nav-menu-button"
        @click="$emit('menu')"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
import DashboardAccountMenu from './DashboardAccountMenu.vue'

export interface DashboardTopNavItem {
  key: string
  label: string
  to?: string
  active?: boolean
}

defineProps<{
  items: readonly DashboardTopNavItem[]
  homeTo: string
}>()

defineEmits<{ menu: [] }>()
</script>
