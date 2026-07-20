<template>
  <UDashboardNavbar :title="navbarTitle">
    <template #left>
      <UDropdownMenu
        v-if="!inAdminWorkspace && site"
        :items="locationMenuItems"
        :content="{ align: 'start', collisionPadding: 12 }"
        :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width) min-w-64' }"
      >
        <UButton
          :label="currentLocation?.title ?? 'No locations'"
          :avatar="{ icon: 'i-lucide-map-pin' }"
          trailing-icon="i-lucide-chevrons-up-down"
          color="neutral"
          variant="ghost"
          class="data-[state=open]:bg-elevated"
          :ui="{ label: 'truncate text-left max-w-48', trailingIcon: 'text-dimmed' }"
        />
      </UDropdownMenu>
    </template>

    <template #right>
      <DashboardNotificationCenter v-if="organization || inAdminWorkspace" />
      <UColorModeButton variant="ghost" color="neutral" size="sm" />
      <UTooltip v-if="!inAdminWorkspace && !inConversationsWorkspace && site" text="ChowBot">
        <UButton
          icon="i-lucide-bot"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Open ChowBot"
          @click="toggleChowbot"
        />
      </UTooltip>
    </template>
  </UDashboardNavbar>
</template>

<script setup lang="ts">
const {
  organization,
  site,
  currentLocation,
  inAdminWorkspace,
  inConversationsWorkspace,
  locationMenuItems,
  navbarTitle,
} = useDashboardNavigation()

const chowBot = useChowBot()
const toggleChowbot = () => chowBot.toggle()
</script>
