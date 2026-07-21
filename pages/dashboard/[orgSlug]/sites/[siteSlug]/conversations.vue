<template>
  <UDashboardPanel id="conversations-list" resizable :min-size="18" :default-size="22" :max-size="30" class="min-h-0!">
    <template #header>
      <UDashboardNavbar title="Conversations">
        <template #right>
          <UTooltip text="New conversation">
            <UButton icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" aria-label="New conversation" @click="newChowBotChat" />
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <ClientOnly>
        <div class="space-y-1">
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
          <div class="space-y-1">
            <USkeleton v-for="i in 4" :key="i" class="h-8 rounded-lg" />
          </div>
        </template>
      </ClientOnly>
    </template>
  </UDashboardPanel>

  <UDashboardPanel id="conversations-chat" class="min-h-0!">
    <template #body>
      <ChowBot embedded />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import ChowBot from '~/components/workspace/dashboard/ChowBot.vue'
import { useChowBot } from '~/composables/useChowBot'
import { useChowBotHistory } from '~/composables/useChowBotHistory'
import type { ChowBotConv } from '~/composables/useChowBotHistory'

definePageMeta({ layout: 'dashboard' })

const dashboard = useDashboardSite()
const chowBot = useChowBot()
const chowBotHistory = useChowBotHistory()

const activeSiteId = dashboard.siteId
const siteConversations = computed(() => activeSiteId.value ? chowBotHistory.forSite(activeSiteId.value) : [])
const activeConversationId = computed(() => chowBot.conversationId.value)

const newChowBotChat = () => chowBot.startNewConversation()
const loadChowBotChat = (conv: ChowBotConv) => chowBot.loadConversation(conv)

watch(activeSiteId, (siteId) => {
  if (!import.meta.client || !siteId) return
  chowBotHistory.load(siteId).catch(console.error)
}, { immediate: true })
</script>
