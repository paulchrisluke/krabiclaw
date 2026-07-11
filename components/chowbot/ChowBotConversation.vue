<template>
  <ConversationShell
    :messages="messages"
    :input="input"
    :placeholder="placeholder"
    :disabled="disabled"
    :loading="loading"
    :maxrows="maxrows"
    :empty-title="emptyTitle"
    :empty-description="emptyDescription"
    :starter-prompts="starterPrompts"
    :show-empty-state="showEmptyState"
    :show-default-empty-icon="showBotEmptyIcon"
    :messages-status="messagesStatus"
    :render-markdown="renderMarkdown"
    :tool-label="toolLabel"
    :quick-replies="quickReplies"
    :show-prompt="showPrompt"
    @update:input="$emit('update:input', $event)"
    @submit="$emit('submit')"
    @stop="$emit('stop')"
    @starter="$emit('starter', $event)"
    @quick-reply="$emit('quick-reply', $event)"
  >
    <template #assistant-after="slotProps">
      <slot name="assistant-after" v-bind="slotProps" />
    </template>
    <template #prompt-before>
      <slot name="prompt-before" />
    </template>
    <template #prompt-after>
      <slot name="prompt-after" />
    </template>
  </ConversationShell>
</template>

<script setup lang="ts" generic="TMessage extends { role: 'user' | 'assistant', content: string, toolCalls?: { name: string, status?: string }[] }">
import ConversationShell, { type ConversationQuickReplyOption } from '~/components/conversation/ConversationShell.vue'

withDefaults(defineProps<{
  messages: TMessage[]
  input: string
  placeholder: string
  loading?: boolean
  disabled?: boolean
  maxrows?: number
  emptyTitle?: string
  emptyDescription?: string
  starterPrompts?: string[]
  showEmptyState?: boolean
  showBotEmptyIcon?: boolean
  messagesStatus?: 'submitted' | 'streaming' | undefined
  renderMarkdown: (_text: string) => string
  toolLabel?: (_name: string) => string
  quickReplies?: ConversationQuickReplyOption[]
  showPrompt?: boolean
}>(), {
  loading: false,
  disabled: false,
  toolLabel: (name: string) => name,
  maxrows: 8,
  emptyTitle: '',
  emptyDescription: '',
  starterPrompts: () => [],
  showEmptyState: true,
  showBotEmptyIcon: true,
  messagesStatus: undefined,
  quickReplies: () => [],
  showPrompt: true,
})

defineEmits<{
  'update:input': [value: string]
  submit: []
  stop: []
  starter: [prompt: string]
  'quick-reply': [reply: ConversationQuickReplyOption]
}>()
</script>
