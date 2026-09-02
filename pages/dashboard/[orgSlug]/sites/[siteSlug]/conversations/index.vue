<template>
  <UDashboardPanel id="conversations-index">
    <template #header>
      <UDashboardNavbar :toggle="false" title="Assistant">
        <template #leading>
          <DashboardNavbarLeading />
        </template>
        <template #right>
          <UButton
            :to="newConversationPath"
            icon="i-lucide-plus"
            label="New conversation"
            color="primary"
            size="sm"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-5">
        <div>
          <h2 class="text-lg font-semibold text-highlighted">Conversations</h2>
          <p class="mt-1 text-sm text-muted">Choose a conversation or start a new one with ChowBot.</p>
        </div>

        <div v-if="isLoading" class="space-y-2" aria-label="Loading conversations">
          <USkeleton v-for="i in 4" :key="i" class="h-14 rounded-lg" />
        </div>

        <UAlert
          v-else-if="loadError"
          color="error"
          variant="soft"
          title="Could not load conversations"
          :description="loadError"
        >
          <template #actions>
            <UButton label="Retry" color="error" variant="outline" size="sm" @click="loadConversations" />
          </template>
        </UAlert>

        <div v-else-if="siteConversations.length" class="space-y-2">
          <NuxtLink
            v-for="conversation in siteConversations"
            :key="conversation.id"
            :to="conversationPath(conversation.id)"
            class="flex items-center gap-3 rounded-lg border border-default bg-elevated px-4 py-3 transition-colors hover:bg-accented"
          >
            <UIcon
              :name="conversation.active_channel === 'whatsapp' ? 'i-simple-icons-whatsapp' : 'i-lucide-message-square'"
              class="size-4 shrink-0 text-primary"
            />
            <span class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">{{ conversation.title }}</span>
            <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted" />
          </NuxtLink>
        </div>

        <UCard v-else class="text-center">
          <UIcon name="i-lucide-message-square" class="mx-auto size-8 text-muted" />
          <h2 class="mt-3 text-base font-semibold text-highlighted">No conversations yet</h2>
          <p class="mt-1 text-sm text-muted">Start with ChowBot and your first conversation will appear here.</p>
          <UButton :to="newConversationPath" label="Start a conversation" color="primary" class="mt-4" />
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import { useChowBotHistory } from '~/composables/useChowBotHistory'

definePageMeta({ layout: 'dashboard' })

const dashboard = useDashboardSite()
const chowBotHistory = useChowBotHistory()
const activeSiteId = dashboard.siteId
const { paths } = useDashboardSiteLinks('')

const siteConversations = computed(() => activeSiteId.value ? chowBotHistory.forSite(activeSiteId.value) : [])
const newConversationPath = computed(() => `${paths.value.conversations}/new`)
const conversationPath = (id: string) => `${paths.value.conversations}/${id}`
const isLoading = ref(true)
const loadError = ref<string | null>(null)

const loadConversations = async () => {
  const siteId = activeSiteId.value
  if (!siteId) {
    loadError.value = 'The site context is unavailable.'
    isLoading.value = false
    return
  }

  isLoading.value = true
  loadError.value = null
  try {
    await chowBotHistory.load(siteId)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'The conversation list could not be loaded.'
  } finally {
    isLoading.value = false
  }
}

watch(activeSiteId, (siteId) => {
  if (import.meta.client && siteId) void loadConversations()
}, { immediate: true })
</script>
