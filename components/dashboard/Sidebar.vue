<template>
  <UDashboardSidebar resizable collapsible>
    <template #header="{ collapsed }">
      <DashboardContextSwitcher :collapsed="collapsed" />
    </template>

    <template #default="{ collapsed }">
      <template v-if="inConversationsWorkspace">
        <div class="flex flex-col gap-3 px-2">
          <UTooltip :text="collapsed ? 'New conversation' : undefined">
            <UButton
              icon="i-lucide-plus"
              :label="collapsed ? undefined : 'New conversation'"
              color="primary"
              variant="soft"
              size="sm"
              :block="!collapsed"
              @click="newChowBotChat"
            />
          </UTooltip>

          <ClientOnly>
            <div v-if="!collapsed" class="space-y-1">
              <UButton
                v-for="conv in siteConversations"
                :key="conv.id"
                :label="conv.title"
                :icon="conv.active_channel === 'whatsapp' ? 'i-simple-icons-whatsapp' : 'i-lucide-message-square'"
                :color="conv.id === activeConversationId ? 'primary' : 'neutral'"
                :variant="conv.id === activeConversationId ? 'soft' : 'ghost'"
                size="sm"
                class="w-full justify-start"
                :ui="{ label: 'truncate text-left' }"
                @click="loadChowBotChat(conv)"
              />
              <p v-if="!siteConversations.length" class="px-1 py-2 text-xs text-muted">
                No conversations yet
              </p>
            </div>
            <template #fallback>
              <div v-if="!collapsed" class="space-y-1">
                <USkeleton v-for="i in 4" :key="i" class="h-8 rounded-lg" />
              </div>
            </template>
          </ClientOnly>
        </div>
      </template>
      <div v-else class="flex flex-col gap-2 px-2">
        <PlatformCommandSearchTrigger
          surface="dashboard"
          :compact="collapsed"
          label="Search dashboard, docs, help..."
          aria-label="Open dashboard search"
        />
        <UNavigationMenu
          :collapsed="collapsed"
          :items="navigationItems"
          orientation="vertical"
        />
      </div>
    </template>

    <template #footer="{ collapsed }">
      <DashboardAccountMenu :collapsed="collapsed" />
    </template>
  </UDashboardSidebar>
</template>

<script setup lang="ts">
import PlatformCommandSearchTrigger from '~/components/platform/search/PlatformCommandSearchTrigger.vue'
import type { ChowBotConv } from '~/composables/useChowBotHistory'

const { activeSiteId, inConversationsWorkspace, navigationItems } = useDashboardNavigation()
const chowBot = useChowBot()
const chowBotHistory = useChowBotHistory()

const siteConversations = computed(() => activeSiteId.value ? chowBotHistory.forSite(activeSiteId.value) : [])
const activeConversationId = computed(() => chowBot.conversationId.value)

const newChowBotChat = () => chowBot.startNewConversation()
const loadChowBotChat = (conv: ChowBotConv) => chowBot.loadConversation(conv)

watch(activeSiteId, (siteId) => {
  if (!import.meta.client || !siteId) return
  chowBotHistory.load(siteId).catch(console.error)
}, { immediate: true })
</script>
