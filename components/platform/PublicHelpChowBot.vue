<template>
  <div class="mx-auto flex max-w-5xl flex-col overflow-hidden rounded-[28px] border border-default bg-default shadow-sm">
    <div class="flex-1 min-h-0 overflow-y-auto">
      <UChatMessages>
        <div v-if="messages.length === 0" class="px-6 py-10 sm:px-10 sm:py-12">
          <div class="max-w-4xl">
            <span class="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <span class="size-2 rounded-full bg-primary" />
              All systems normal.
            </span>

            <h1 class="mt-8 text-4xl font-bold tracking-tight text-default sm:text-5xl">KrabiClaw Support</h1>
            <p class="mt-3 text-3xl font-semibold tracking-tight text-muted sm:text-4xl">How can we help you today?</p>

            <div class="mt-8 grid gap-4 md:grid-cols-2">
              <NuxtLink
                v-for="card in routeCards"
                :key="card.to"
                :to="card.to"
                class="group rounded-3xl border border-default bg-elevated/40 p-6 no-underline transition hover:border-muted hover:bg-elevated"
              >
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <p class="text-lg font-semibold text-default">{{ card.title }}</p>
                    <p class="mt-3 text-sm leading-relaxed text-muted">{{ card.description }}</p>
                  </div>
                  <UIcon name="i-heroicons-arrow-up-right" class="mt-1 size-5 shrink-0 text-muted transition group-hover:text-default" />
                </div>
              </NuxtLink>
            </div>

            <div class="mt-10">
              <UChatMessage
                id="support-intro"
                role="assistant"
                :parts="[{ type: 'text', text: supportIntro }]"
                side="left"
              >
                <template #content>
                  <div class="space-y-3">
                    <div class="flex items-center gap-3">
                      <div class="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <UIcon name="i-custom-bot" class="size-4" />
                      </div>
                      <p class="text-sm font-semibold text-default">ChowBot</p>
                    </div>
                    <p class="max-w-3xl text-sm leading-relaxed text-default">
                      {{ supportIntro }}
                    </p>
                  </div>
                </template>
              </UChatMessage>
            </div>
          </div>
        </div>

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
              <!-- eslint-disable vue/no-v-html -->
              <div
                v-if="msg.content"
                class="prose prose-sm max-w-none text-default dark:prose-invert"
                v-html="renderMarkdown(msg.content)"
              />
              <!-- eslint-enable vue/no-v-html -->

              <div v-if="msg.citations?.length" class="flex flex-wrap gap-2">
                <NuxtLink
                  v-for="citation in msg.citations"
                  :key="`${citation.path}-${citation.title}`"
                  :to="citation.path"
                  class="rounded-full border border-default px-3 py-1.5 text-xs text-default no-underline transition hover:border-muted hover:bg-elevated"
                >
                  {{ citation.title }}
                </NuxtLink>
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
        placeholder="Send a message..."
        :disabled="isLoading"
        :loading="isLoading"
        :maxrows="8"
        @submit="handleSubmit"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { sanitizeHtmlForSsr } from '~/utils/markdown'
import { PUBLIC_SUPPORT_ROUTE_CARDS } from '~/utils/public-support'

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
  escalation?: HelpEscalation | null
  escalationSubmitted?: boolean
}

const routeCards = PUBLIC_SUPPORT_ROUTE_CARDS
const input = ref('')
const messages = ref<HelpMessage[]>([])
const isLoading = ref(false)
const supportIntro = 'Hello, I\'m ChowBot an AI assistant from KrabiClaw. If we find something I can\'t solve, I\'ll help create a support case for you.'

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

async function handleSubmit() {
  const message = input.value.trim()
  if (!message || isLoading.value) return

  input.value = ''
  messages.value = [
    ...messages.value,
    { role: 'user', content: message },
    { role: 'assistant', content: '' },
  ]
  isLoading.value = true

  try {
    const history = messages.value
      .slice(0, -1)
      .map(item => ({ role: item.role, content: item.content }))

    const response = await $fetch<{
      reply: string
      citations?: HelpCitation[]
      escalation?: HelpEscalation | null
    }>('/api/public/help/agent', {
      method: 'POST',
      body: {
        message,
        history,
      },
    })

    messages.value = [
      ...messages.value.slice(0, -1),
      {
        role: 'assistant',
        content: response.reply,
        citations: response.citations ?? [],
        escalation: response.escalation ?? null,
        escalationSubmitted: false,
      },
    ]
  } catch (error) {
    const content = error instanceof Error ? error.message : 'Something went wrong. Please try again.'
    messages.value = [
      ...messages.value.slice(0, -1),
      { role: 'assistant', content },
    ]
  } finally {
    isLoading.value = false
  }
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
