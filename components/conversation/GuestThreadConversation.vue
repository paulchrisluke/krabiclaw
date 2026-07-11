<template>
  <ConversationShell
    v-model:input="draft"
    :messages="messages"
    :placeholder="placeholder"
    :disabled="disabled"
    :loading="loading"
    :show-empty-state="messages.length === 0"
    :show-default-empty-icon="false"
    :empty-title="emptyTitle"
    :empty-description="emptyDescription"
    :cancelable="false"
    submit-label="Send reply"
    @submit="$emit('submit')"
  >
    <template #message="{ message }">
      <div v-if="message.type === 'event'" class="px-4 py-2">
        <div class="mx-auto max-w-[22.5rem] rounded-[10px] bg-muted px-3 py-1.5 text-center text-xs font-semibold text-muted">
          {{ message.body }}
        </div>
      </div>

      <div
        v-else
        class="flex px-4 py-2"
        :class="message.role === 'owner' ? 'justify-end' : 'justify-start'"
      >
        <div class="flex max-w-[78%] items-start gap-3" :class="message.role === 'owner' ? 'flex-row-reverse' : ''">
          <div
            class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border"
            :class="message.role === 'owner' ? 'border-primary/20 bg-primary/10 text-primary' : 'border-default bg-elevated text-muted'"
          >
            <UIcon :name="message.role === 'owner' ? 'i-lucide-mail' : 'i-lucide-user-round'" class="size-4" />
          </div>

          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2 text-[11px] text-muted" :class="message.role === 'owner' ? 'justify-end' : ''">
              <span class="font-semibold text-highlighted">{{ roleLabel(message.role) }}</span>
              <span>{{ channelLabel(message.channel) }}</span>
              <span>{{ formatTimestamp(message.createdAt) }}</span>
            </div>
            <div
              class="rounded-[14px] border px-4 py-3 text-sm leading-relaxed"
              :class="message.role === 'owner'
                ? 'rounded-tr-[5px] border-primary bg-primary text-(--primary-foreground,#fff)'
                : 'rounded-tl-[5px] border-default bg-elevated text-default'"
            >
              {{ message.body }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #prompt-after>
      <p class="mt-2 text-xs text-muted">
        Replies from this inbox are sent by email. Guest replies return to this thread.
      </p>
    </template>
  </ConversationShell>
</template>

<script setup lang="ts">
import ConversationShell from '~/components/conversation/ConversationShell.vue'

interface GuestThreadTimelineMessage {
  id: string
  type: 'message' | 'event'
  role: 'guest' | 'owner' | 'system'
  body: string
  createdAt: string
  channel?: 'email' | 'whatsapp' | 'web'
}

const draft = defineModel<string>('input', { required: true })

withDefaults(defineProps<{
  messages: GuestThreadTimelineMessage[]
  placeholder?: string
  loading?: boolean
  disabled?: boolean
  emptyTitle?: string
  emptyDescription?: string
}>(), {
  placeholder: 'Write your reply…',
  loading: false,
  disabled: false,
  emptyTitle: 'No messages yet',
  emptyDescription: 'Guest replies will appear here.',
})

defineEmits<{
  submit: []
}>()

function roleLabel(role: GuestThreadTimelineMessage['role']) {
  if (role === 'owner') return 'Owner'
  if (role === 'guest') return 'Guest'
  return 'System'
}

function channelLabel(channel: GuestThreadTimelineMessage['channel']) {
  if (channel === 'email') return 'Email'
  if (channel === 'whatsapp') return 'WhatsApp'
  if (channel === 'web') return 'Website'
  return 'System'
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}
</script>
