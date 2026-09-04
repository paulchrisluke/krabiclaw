<template>
  <UDashboardPanel id="conversation-detail">
    <template #header>
      <UDashboardNavbar :title="conversationTitle">
        <template #leading>
          <DashboardNavbarLeading :to="assistantPath" label="Assistant" />
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
      <div v-if="isLoading" class="mx-auto flex h-full w-full max-w-3xl flex-col gap-4" aria-label="Loading conversation">
        <USkeleton class="h-10 w-48 rounded-lg" />
        <USkeleton class="h-full min-h-64 rounded-xl" />
      </div>

      <div v-else-if="loadError" class="mx-auto flex w-full max-w-xl items-center justify-center py-16">
        <UAlert
          color="error"
          variant="soft"
          title="Could not load this conversation"
          :description="loadError"
        >
          <template #actions>
            <UButton label="Retry" color="error" variant="outline" size="sm" @click="loadConversation" />
          </template>
        </UAlert>
      </div>

      <ChowBot v-else embedded />
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
import ChowBot from '~/lib/components/workspace/dashboard/ChowBot.vue'
import { useChowBot } from '~/composables/useChowBot'

definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const dashboard = useDashboardSite()
const chowBot = useChowBot()
const activeSiteId = dashboard.siteId
const { paths } = useDashboardSiteLinks()

const assistantPath = computed(() => paths.value.conversations)
const newConversationPath = computed(() => `${assistantPath.value}/new`)
const requestedConversationId = computed(() => {
  const value = route.params.conversationId
  return typeof value === 'string' ? value : ''
})
const conversationTitle = ref('New conversation')
const isLoading = ref(true)
const loadError = ref<string | null>(null)
let loadSequence = 0

const loadConversation = async () => {
  const sequence = ++loadSequence
  const id = requestedConversationId.value
  loadError.value = null

  if (!id) {
    loadError.value = 'The conversation id is missing.'
    isLoading.value = false
    return
  }

  if (id === 'new') {
    chowBot.startNewConversation()
    conversationTitle.value = 'New conversation'
    isLoading.value = false
    return
  }

  const siteId = activeSiteId.value
  if (!siteId) {
    loadError.value = 'The site context is unavailable.'
    isLoading.value = false
    return
  }

  isLoading.value = true
  conversationTitle.value = 'Conversation'
  chowBot.clearMessages()
  try {
    const conversation = await chowBot.loadConversationById(id)
    if (sequence !== loadSequence) return
    conversationTitle.value = conversation.title
  } catch (error) {
    if (sequence !== loadSequence) return
    loadError.value = error instanceof Error ? error.message : 'The conversation could not be loaded.'
  } finally {
    if (sequence === loadSequence) isLoading.value = false
  }
}

watch([activeSiteId, requestedConversationId], () => { void loadConversation() }, { immediate: true })
</script>
