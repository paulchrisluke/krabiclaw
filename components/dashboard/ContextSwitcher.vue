<template>
  <template v-if="inLocationWorkspace">
    <div v-if="collapsed" class="flex items-center justify-center w-full">
      <UButton
        :to="siteBase ?? orgBase ?? '/dashboard'"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Back to Dashboard"
      />
    </div>
    <NuxtLink
      v-else
      :to="siteBase ?? orgBase ?? '/dashboard'"
      class="flex items-center gap-2 px-2.5 py-1.5 text-sm font-semibold text-muted hover:text-highlighted hover:bg-muted rounded-lg transition-colors w-full"
    >
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" />
      <span class="truncate">{{ currentLocation?.title ?? 'Location' }}</span>
    </NuxtLink>
  </template>

  <template v-else-if="inSettingsWorkspace">
    <div v-if="collapsed" class="flex items-center justify-center w-full">
      <UButton
        :to="orgBase ?? '/dashboard'"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Back to Dashboard"
      />
    </div>
    <NuxtLink
      v-else
      :to="orgBase ?? '/dashboard'"
      class="flex items-center gap-2 px-2.5 py-1.5 text-sm font-semibold text-muted hover:text-highlighted hover:bg-muted rounded-lg transition-colors w-full"
    >
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" />
      <span class="truncate">Back to Dashboard</span>
    </NuxtLink>
  </template>

  <template v-else-if="inConversationsWorkspace">
    <div v-if="collapsed" class="flex items-center justify-center w-full">
      <UButton
        :to="siteBase ?? orgBase ?? '/dashboard'"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Back to Dashboard"
      />
    </div>
    <NuxtLink
      v-else
      :to="siteBase ?? orgBase ?? '/dashboard'"
      class="flex items-center gap-2 px-2.5 py-1.5 text-sm font-semibold text-muted hover:text-highlighted hover:bg-muted rounded-lg transition-colors w-full"
    >
      <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" />
      <span class="truncate">Back to Dashboard</span>
    </NuxtLink>
  </template>

  <UDropdownMenu
    v-else
    :items="organizationMenuItems"
    :content="{ align: 'start', collisionPadding: 12 }"
    :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width) min-w-64' }"
  >
    <UButton
      :avatar="organizationAvatar"
      :label="collapsed ? undefined : organizationLabel"
      trailing-icon="i-lucide-chevrons-up-down"
      color="neutral"
      variant="ghost"
      class="w-full data-[state=open]:bg-elevated"
      :block="collapsed"
      :ui="{ label: 'truncate text-left', trailingIcon: 'text-dimmed ms-auto' }"
    />
  </UDropdownMenu>
</template>

<script setup lang="ts">
defineProps<{ collapsed?: boolean }>()

const {
  currentLocation,
  inLocationWorkspace,
  inSettingsWorkspace,
  inConversationsWorkspace,
  orgBase,
  siteBase,
  organizationLabel,
  organizationAvatar,
  organizationMenuItems,
} = useDashboardNavigation()
</script>
