<template>
  <ChowBotConversation
    v-model:input="input"
    :messages="messages"
    placeholder="Ask ChowBot anything..."
    :disabled="isLoading"
    :loading="isLoading"
    :show-empty-state="false"
    :render-markdown="renderMarkdown"
    @submit="handleSubmit"
    @stop="handleStop"
  >
    <template #assistant-after="{ message, index }">
      <div v-if="message.loading" class="flex items-center gap-3 text-sm text-muted">
        <span class="flex items-center gap-1.5">
          <span class="size-2 rounded-full bg-primary animate-pulse" />
          <span class="size-2 rounded-full bg-primary/70 animate-pulse [animation-delay:120ms]" />
          <span class="size-2 rounded-full bg-primary/40 animate-pulse [animation-delay:240ms]" />
        </span>
        <span>ChowBot is thinking…</span>
      </div>

      <div v-if="message.suggestedLinks?.length" class="space-y-2 pt-1">
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Related resources
        </p>
        <div class="flex flex-wrap gap-2">
          <NuxtLink
            v-for="link in message.suggestedLinks"
            :key="`${link.path}-${link.title}`"
            :to="link.path"
            class="inline-flex items-center gap-2 rounded-full border border-default px-3 py-1.5 text-xs font-medium text-default no-underline transition hover:border-muted hover:bg-elevated"
          >
            <span>{{ link.title }}</span>
            <UIcon name="i-lucide-move-up-right" class="size-3.5 text-muted" />
          </NuxtLink>
        </div>
      </div>

      <div v-if="message.followUpPrompts?.length" class="space-y-2 pt-1">
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Ask next
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="prompt in message.followUpPrompts"
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

      <div v-if="message.escalation && !message.escalationSubmitted" class="pt-2">
        <PlatformSupportContactForm
          title="Send this to support"
          description="If you’re still blocked, send the details here and the team will follow up."
          submit-label="Send support request"
          source="help_agent"
          route-context="/help"
          :initial-topic="message.escalation.topic"
          :initial-message="message.escalation.message"
          :suggested-summary="message.escalation.suggested_summary"
          :agent-metadata="message.escalation.agent_metadata_json"
          @submitted="markEscalationSubmitted(index)"
        />
      </div>
    </template>
    <template #prompt-after>
      <p class="mt-2 text-xs text-muted">
        Ask about docs, billing, setup, domains, or send it to support.
      </p>
    </template>
  </ChowBotConversation>
</template>

<script setup lang="ts">
import ChowBotConversation from '~/components/chowbot/ChowBotConversation.vue'
import DOMPurify from 'isomorphic-dompurify'
import { marked } from 'marked'

const renderer = new marked.Renderer()
renderer.link = function ({ href, title, tokens }) {
  const titleAttr = title ? ` title="${title}"` : ''
  const text = this.parser.parseInline(tokens)
  return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`
}
marked.setOptions({ renderer, breaks: true, gfm: true })

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
  suggestedLinks?: HelpCitation[]
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

function renderMarkdown(text: string): string {
  const html = marked.parse(text) as string
  return DOMPurify.sanitize(html)
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
      .slice(0, -2)
      .map(item => ({ role: item.role, content: item.content }))

    const response = await $fetch<{
      reply: string
      citations?: HelpCitation[]
      suggestedLinks?: HelpCitation[]
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
        suggestedLinks: response.suggestedLinks ?? [],
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
