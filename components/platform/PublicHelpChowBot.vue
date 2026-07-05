<template>
  <div class="flex min-h-[32rem] flex-col">
    <div class="flex-1 min-h-0 overflow-y-auto">
      <UChatMessages>
        <UChatMessage
          v-for="(msg, index) in messages"
          :key="`${msg.role}-${index}`"
          :id="String(index)"
          :role="msg.role"
          :parts="[{ type: 'text', text: msg.content }]"
          :side="msg.role === 'user' ? 'right' : 'left'"
        >
          <template #content>
            <div v-if="msg.role === 'assistant'" class="space-y-3">
              <div v-if="msg.loading" class="flex items-center gap-3 text-sm text-muted">
                <span class="flex items-center gap-1.5">
                  <span class="size-2 rounded-full bg-primary animate-pulse" />
                  <span class="size-2 rounded-full bg-primary/70 animate-pulse [animation-delay:120ms]" />
                  <span class="size-2 rounded-full bg-primary/40 animate-pulse [animation-delay:240ms]" />
                </span>
                <span>ChowBot is thinking…</span>
              </div>

              <!-- eslint-disable vue/no-v-html -->
              <div
                v-if="msg.content"
                class="prose prose-sm max-w-none text-default dark:prose-invert"
                v-html="renderMarkdown(msg.content)"
              />
              <!-- eslint-enable vue/no-v-html -->

              <div v-if="msg.citations?.length" class="space-y-2">
                <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                  Related resources
                </p>
                <div class="flex flex-wrap gap-2">
                  <NuxtLink
                    v-for="citation in msg.citations"
                    :key="`${citation.path}-${citation.title}`"
                    :to="citation.path"
                    class="inline-flex items-center gap-2 rounded-full border border-default px-3 py-1.5 text-xs font-medium text-default no-underline transition hover:border-muted hover:bg-elevated"
                  >
                    <span>{{ citation.title }}</span>
                    <UIcon name="i-lucide-move-up-right" class="size-3.5 text-muted" />
                  </NuxtLink>
                </div>
              </div>

              <div v-if="msg.followUpPrompts?.length" class="space-y-2">
                <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
                  Ask next
                </p>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="prompt in msg.followUpPrompts"
                    :key="prompt"
                    type="button"
                    class="rounded-full border border-default px-3 py-1.5 text-xs font-medium text-default transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="isLoading"
                    @click="handleSuggestedPrompt(prompt)"
                  >
                    {{ prompt }}
                  </button>
                </div>
              </div>

              <div v-if="msg.escalation && !msg.escalationSubmitted" class="pt-2">
                <PlatformSupportContactForm
                  title="Send this to support"
                  description="If you’re still blocked, send the details here and the team will follow up."
                  submit-label="Send support request"
                  source="help_agent"
                  route-context="/help"
                  :initial-topic="msg.escalation.topic"
                  :initial-message="msg.escalation.message"
                  :suggested-summary="msg.escalation.suggested_summary"
                  :agent-metadata="msg.escalation.agent_metadata_json"
                  @submitted="markEscalationSubmitted(index)"
                />
              </div>
            </div>
            <div v-else class="prose prose-sm max-w-none text-default dark:prose-invert">
              {{ msg.content }}
            </div>
          </template>
        </UChatMessage>
      </UChatMessages>
    </div>

    <div class="border-t border-default p-3">
      <UChatPrompt
        v-model="input"
        variant="subtle"
        placeholder="Send a message..."
        :disabled="isLoading"
        :loading="isLoading"
        :rows="3"
        :maxrows="8"
        class="min-h-[132px] rounded-[24px] bg-elevated/60 ring-1 ring-inset ring-default/80"
        :ui="{
          root: 'min-h-[132px] px-4 py-3',
          body: 'text-sm leading-6 text-default',
          footer: 'mt-auto pt-2',
        }"
        @submit="handleSubmit"
      >
        <template #footer>
          <div class="flex w-full items-center justify-between gap-3">
            <p class="text-xs text-muted">
              Ask about docs, billing, setup, domains, or send it to support.
            </p>
            <UChatPromptSubmit
              :status="isLoading ? 'streaming' : 'ready'"
              color="primary"
              variant="solid"
              size="sm"
              :disabled="!isLoading && !input.trim()"
              @stop="handleStop"
            />
          </div>
        </template>
      </UChatPrompt>
    </div>
  </div>
</template>

<script setup lang="ts">
import { sanitizeHtmlForSsr } from '~/utils/markdown'

type HelpCitation = {
  title: string
  path: string
  type: string
}

type HelpEscalation = {
  topic: string
  message: string
  suggested_summary?: string | null
  agent_metadata_json?: ApiValue
}

type HelpMessage = {
  role: 'user' | 'assistant'
  content: string
  citations?: HelpCitation[]
  followUpPrompts?: string[]
  escalation?: HelpEscalation | null
  escalationSubmitted?: boolean
  loading?: boolean
}

const supportIntro = 'Hello, I\'m ChowBot an AI assistant from KrabiClaw. If we find something I can\'t solve, I\'ll help create a support case for you.'
const input = ref('')
const messages = ref<HelpMessage[]>([
  {
    role: 'assistant',
    content: supportIntro,
  },
])
const isLoading = ref(false)
const activeRequest = ref<AbortController | null>(null)

const DOMPurify = import.meta.client
  ? (await import('isomorphic-dompurify')).default
  : { sanitize: sanitizeHtmlForSsr }

function linkifyMarkdown(text: string): string {
  return text.replace(
    /\[([^\]]+)\]\((\/[^)\s]+)\)/g,
    '<a href="$2">$1</a>',
  ).replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  )
}

function renderMarkdown(text: string): string {
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^[-*] (.+)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(.+)$/, '<p>$1</p>')

  return DOMPurify.sanitize(linkifyMarkdown(html))
}

async function submitMessage(message: string) {
  const normalizedMessage = message.trim()
  if (!normalizedMessage || isLoading.value) return

  input.value = ''
  messages.value = [
    ...messages.value,
    { role: 'user', content: normalizedMessage },
    { role: 'assistant', content: '', loading: true },
  ]
  isLoading.value = true

  const controller = new AbortController()
  activeRequest.value = controller

  try {
    const history = messages.value
      .slice(0, -1)
      .map(item => ({ role: item.role, content: item.content }))

    const response = await $fetch<{
      reply: string
      citations?: HelpCitation[]
      followUpPrompts?: string[]
      escalation?: HelpEscalation | null
    }>('/api/public/help/agent', {
      method: 'POST',
      body: {
        message: normalizedMessage,
        history,
      },
      signal: controller.signal,
    })

    messages.value = [
      ...messages.value.slice(0, -1),
      {
        role: 'assistant',
        content: response.reply,
        citations: response.citations ?? [],
        followUpPrompts: response.followUpPrompts ?? [],
        escalation: response.escalation ?? null,
        escalationSubmitted: false,
      },
    ]
  } catch (error) {
    if (controller.signal.aborted) {
      messages.value = [
        ...messages.value.slice(0, -1),
        { role: 'assistant', content: 'Stopped.' },
      ]
      return
    }

    const content = error instanceof Error ? error.message : 'Something went wrong. Please try again.'
    messages.value = [
      ...messages.value.slice(0, -1),
      { role: 'assistant', content },
    ]
  } finally {
    if (activeRequest.value === controller) activeRequest.value = null
    isLoading.value = false
  }
}

async function handleSubmit() {
  await submitMessage(input.value)
}

async function handleSuggestedPrompt(prompt: string) {
  await submitMessage(prompt)
}

function handleStop() {
  activeRequest.value?.abort()
}

function markEscalationSubmitted(index: number) {
  const next = [...messages.value]
  const message = next[index]
  if (!message) return
  next[index] = {
    ...message,
    escalationSubmitted: true,
  }
  next.push({
    role: 'assistant',
    content: 'Thanks. Your support request is on its way and the team will follow up by email.',
  })
  messages.value = next
}
</script>
