<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex-1 min-h-0 overflow-y-auto">
      <UChatMessages :status="messagesStatus" class="py-4">
        <div
          v-if="showEmptyState && messages.length === 0"
          class="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center"
        >
          <UIcon v-if="showBotEmptyIcon" name="i-lucide-sparkles" class="size-8 text-primary opacity-60" />
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
        </div>

        <UChatMessage
          v-for="(msg, i) in messages"
          :key="messageKey(msg, i)"
          :id="String(i)"
          :role="msg.role"
          :parts="[{ type: 'text', text: msg.content ?? '' }]"
          :side="msg.role === 'user' ? 'right' : 'left'"
          :variant="msg.role === 'user' ? 'solid' : 'subtle'"
          :ui="msg.role === 'user' ? { content: 'bg-primary text-(--primary-foreground,#fff)' } : {}"
        >
          <template v-if="msg.role === 'assistant'" #leading>
            <div class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UIcon name="i-lucide-sparkles" class="size-3.5" />
            </div>
          </template>

          <template #content>
            <div v-if="msg.role === 'assistant'" class="space-y-2">
              <div v-if="msg.toolCalls?.length" class="flex flex-col gap-1">
                <UChatTool
                  v-for="(tool, ti) in msg.toolCalls"
                  :key="tool.name + i + ti"
                  :text="toolLabel(tool.name)"
                  :loading="tool.status === 'running'"
                />
              </div>
              <!-- eslint-disable vue/no-v-html -->
              <div
                v-if="msg.content"
                class="prose prose-sm dark:prose-invert max-w-none"
                v-html="renderMarkdown(msg.content)"
              />
              <!-- eslint-enable vue/no-v-html -->
              <slot name="assistant-after" :message="msg" :index="i" />
            </div>
            <div v-else class="prose prose-sm dark:prose-invert max-w-none">
              {{ msg.content }}
            </div>
          </template>
        </UChatMessage>
      </UChatMessages>
    </div>

    <div class="shrink-0 border-t border-default p-3">
      <slot name="prompt-before" />

      <div v-if="quickReplies.length" class="flex flex-wrap gap-2">
        <button
          v-for="(reply, i) in quickReplies"
          :key="i"
          data-testid="chowbot-quick-reply"
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
          <UChatPromptSubmit
            :status="loading ? 'streaming' : 'ready'"
            color="primary"
            variant="solid"
            size="xs"
            :disabled="!loading && !input.trim()"
            @stop="$emit('stop')"
          />
        </template>
      </UChatPrompt>

      <slot name="prompt-after" />
    </div>
  </div>
</template>

<script setup lang="ts" generic="TMessage extends { role: 'user' | 'assistant', content: string, toolCalls?: { name: string, status?: string }[] }">
interface QuickReplyOption {
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
  showBotEmptyIcon?: boolean
  messagesStatus?: 'submitted' | 'streaming' | undefined
  renderMarkdown: (_text: string) => string
  toolLabel?: (_name: string) => string
  quickReplies?: QuickReplyOption[]
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
})

defineEmits<{
  'update:input': [value: string]
  submit: []
  stop: []
  starter: [prompt: string]
  'quick-reply': [reply: QuickReplyOption]
}>()

function messageKey(message: TMessage, index: number) {
  return `${message.role}-${index}-${message.content?.slice(0, 24) ?? ''}`
}
</script>
