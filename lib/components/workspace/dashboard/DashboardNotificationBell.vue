<template>
  <UButton
    v-if="to"
    :to="to"
    icon="i-lucide-bell"
    color="neutral"
    variant="ghost"
    square
    class="relative"
    aria-label="Notifications"
    data-testid="dashboard-notification-bell"
  >
    <span
      v-if="unreadCount > 0"
      class="absolute -right-0.5 -top-0.5 h-4 min-w-4 rounded-full bg-error px-1 text-center text-[10px] font-semibold leading-4 text-white"
    >{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
  </UButton>
</template>

<script setup lang="ts">
defineProps<{ to: string | null }>()

const { unreadCount, refreshUnreadCount } = useNotificationUnreadCount()
onMounted(() => { refreshUnreadCount().catch(() => {}) })
</script>
