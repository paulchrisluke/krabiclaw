<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 flex-1 overflow-y-auto">
      <UChatMessages :status="messagesStatus" should-auto-scroll class="py-4">
        <div
          v-if="showEmptyState && messages.length === 0"
          class="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center"
        >
          <slot name="empty-icon">
            <UIcon v-if="showDefaultEmptyIcon" :name="emptyIcon" class="size-8 text-primary opacity-60" />
          </slot>
          <p v-if="emptyTitle" class="text-sm font-medium">{{ emptyTitle }}</p>
          <p v-if="emptyDescription" class="text-xs text-muted">{{ emptyDescription }}</p>
          <div v-if="starterPrompts.length" class="mt-4 flex w-full flex-col gap-2">
            <UButton
              v-for="prompt in starterPrompts"
              :key="prompt"
              color="neutral"
              variant="outline"
              size="xs"
              class="justify-start text-left"
              @click="$emit('starter', prompt)"
            >
              {{ prompt }}
            </UButton>
          </div>
          <slot name="empty-after" />
        </div>

        <template v-for="(message, index) in messages" :key="messageKey(message, index)">
          <slot name="message" :message="message" :index="index">
            <UChatMessage
              :id="String(index)"
              :role="message.role"
              :parts="[{ type: 'text', text: message.content ?? '' }]"
              :side="message.role === 'user' ? 'right' : 'left'"
              :variant="message.role === 'user' ? 'solid' : 'subtle'"
              :ui="message.role === 'user' ? { content: 'bg-primary text-(--primary-foreground,#fff)' } : {}"
            >
              <template v-if="message.role === 'assistant'" #leading>
                <div class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <UIcon name="i-lucide-sparkles" class="size-3.5" />
                </div>
              </template>

              <template #content>
                <div v-if="message.role === 'assistant'" class="space-y-2">
                  <div v-if="message.toolCalls?.length" class="flex flex-col gap-1">
                    <UChatTool
                      v-for="(tool, toolIndex) in message.toolCalls"
                      :key="tool.name + index + toolIndex"
                      :text="toolLabel(tool.name)"
                      :loading="tool.status === 'running'"
                    />
                  </div>
                  <!-- eslint-disable vue/no-v-html -->
                  <div
                    v-if="message.content"
                    class="prose prose-sm dark:prose-invert max-w-none"
                    v-html="renderMarkdown(message.content)"
                  />
                  <!-- eslint-enable vue/no-v-html -->
                  <slot name="assistant-after" :message="message" :index="index" />
                </div>
                <div v-else class="prose prose-sm dark:prose-invert max-w-none">
                  {{ message.content ?? '' }}
                </div>
              </template>
            </UChatMessage>
          </slot>
        </template>
      </UChatMessages>
    </div>

    <div class="shrink-0 border-t border-default p-3">
      <slot name="prompt-before" />

      <div v-if="quickReplies.length" class="flex flex-wrap gap-2">
        <button
          v-for="(reply, index) in quickReplies"
          :key="index"
          data-testid="conversation-quick-reply"
          :data-reply-action="reply.action"
          :class="[
            'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors',
            reply.primary
              ? 'border-primary bg-primary text-white hover:bg-primary/90'
              : reply.ghost
                ? 'border-transparent bg-transparent text-muted hover:border-default hover:text-highlighted'
                : 'border-default bg-elevated text-highlighted hover:border-primary hover:text-primary',
          ]"
          @click="$emit('quick-reply', reply)"
        >
          <UIcon v-if="reply.icon" :name="reply.icon" class="size-3.5" />
          <span class="flex flex-col items-start leading-tight">
            <span>{{ reply.label }}</span>
            <span v-if="reply.sub" class="text-[10.5px] font-medium opacity-70">{{ reply.sub }}</span>
          </span>
        </button>
      </div>

      <UChatPrompt
        v-else
        :model-value="input"
        :placeholder="placeholder"
        :disabled="disabled"
        :loading="loading"
        :maxrows="maxrows"
        @update:model-value="$emit('update:input', $event)"
        @submit="$emit('submit')"
      >
        <template #trailing>
          <slot name="prompt-trailing">
            <UChatPromptSubmit
              :status="loading ? 'streaming' : 'ready'"
              color="primary"
              variant="solid"
              size="xs"
              :aria-label="submitLabel"
              :title="submitLabel"
              :disabled="!loading && !input.trim()"
              @stop="$emit('stop')"
            />
          </slot>
        </template>
      </UChatPrompt>

      <slot name="prompt-after" />
    </div>
  </div>
</template>

<script setup lang="ts" generic="TMessage extends { role: string, content?: string, toolCalls?: { name: string, status?: string }[] }">
export interface ConversationQuickReplyOption {
  label: string
  sub?: string
  icon?: string
  primary?: boolean
  ghost?: boolean
  action?: string
}

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
  showDefaultEmptyIcon?: boolean
  emptyIcon?: string
  messagesStatus?: 'submitted' | 'streaming' | undefined
  renderMarkdown?: (_text: string) => string
  toolLabel?: (_name: string) => string
  quickReplies?: ConversationQuickReplyOption[]
  submitLabel?: string
}>(), {
  loading: false,
  disabled: false,
  maxrows: 8,
  emptyTitle: '',
  emptyDescription: '',
  starterPrompts: () => [],
  showEmptyState: true,
  showDefaultEmptyIcon: true,
  emptyIcon: 'i-lucide-sparkles',
  messagesStatus: undefined,
  quickReplies: () => [],
  submitLabel: 'Send message',
  renderMarkdown: (text: string) => text,
  toolLabel: (name: string) => name,
})

defineEmits<{
  'update:input': [value: string]
  submit: []
  stop: []
  starter: [prompt: string]
  'quick-reply': [reply: ConversationQuickReplyOption]
}>()

function messageKey(message: TMessage, index: number) {
  if ('id' in message && typeof message.id === 'string' && message.id) return message.id
  return `${message.role}-${index}`
}
</script>
