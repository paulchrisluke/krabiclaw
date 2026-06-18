<template>
  <div
    class="flex min-h-0 flex-col border-r border-default bg-default"
    @dragenter.prevent="dragCounter++"
    @dragover.prevent
    @dragleave="dragCounter = Math.max(0, dragCounter - 1)"
    @drop.prevent="onDrop"
  >
    <!-- Drag overlay -->
    <Transition name="fade">
      <div
        v-if="isDragging && step !== 'welcome'"
        class="absolute inset-0 z-10 flex items-center justify-center"
      >
        <UCard class="mx-8 border-2 border-dashed border-primary" :ui="{ body: 'px-8 py-10 sm:px-8 sm:py-10' }">
          <div class="flex flex-col items-center gap-3 text-center">
            <UIcon name="i-heroicons-arrow-up-tray" class="size-10 text-primary" />
            <p class="font-medium text-highlighted">Drop to attach</p>
            <p class="text-xs text-muted">JPEG, PNG, WEBP, PDF — max 10 MB</p>
          </div>
        </UCard>
      </div>
    </Transition>

    <!-- Pane header -->
    <div class="flex shrink-0 items-center justify-between border-b border-default px-5 py-3">
      <div class="flex items-center gap-2">
        <div class="flex size-[26px] items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UIcon name="i-heroicons-sparkles" class="size-4" />
        </div>
        <span class="text-sm font-semibold text-highlighted">Setup assistant</span>
      </div>
    </div>

    <!-- Scroll area -->
    <div ref="scrollRef" class="min-h-0 flex-1 overflow-y-auto">

      <!-- Welcome screen -->
      <div v-if="step === 'welcome'" class="flex flex-col gap-[18px] p-6 pb-4">
        <div class="flex size-16 items-center justify-center rounded-[18px] bg-primary/10 text-primary">
          <UIcon name="i-heroicons-sparkles" class="size-8" />
        </div>
        <div>
          <p class="mb-1 text-[11px] font-bold uppercase tracking-[0.28em] text-primary">Let's build your site</p>
          <h1 class="text-3xl font-extrabold leading-tight tracking-tight text-highlighted">
            Tell me about your business. I'll do the typing.
          </h1>
        </div>
        <p class="text-[14.5px] leading-relaxed text-muted">
          Answer a few questions and a real, SEO-ready site builds itself on the right — you decide what to keep.
        </p>
        <div class="flex flex-col gap-2.5">
          <div
            v-for="[icon, text] in WELCOME_POINTS"
            :key="text"
            class="flex items-center gap-3 text-sm text-highlighted"
          >
            <div class="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] border border-default bg-elevated text-primary">
              <UIcon :name="icon" class="size-3.5" />
            </div>
            {{ text }}
          </div>
        </div>
        <UButton
          color="primary"
          size="md"
          icon="i-heroicons-sparkles"
          class="self-start"
          @click="advance(props.skipVertical ? 'source' : 'vertical')"
        >
          Start building
        </UButton>
      </div>

      <!-- Chat transcript -->
      <UChatMessages
        v-else
        :status="typing ? 'streaming' : undefined"
        class="p-5"
      >
        <template v-for="(msg, i) in messages" :key="msg.id">
          <!-- User bubble -->
          <UChatMessage
            v-if="msg.from === 'user'"
            :id="String(i)"
            role="user"
            :parts="[]"
            side="right"
            variant="soft"
            color="neutral"
          >
            <template #content>
              <p class="text-sm leading-relaxed">{{ msg.text }}</p>
            </template>
          </UChatMessage>

          <!-- Bot bubble -->
          <UChatMessage
            v-else
            :id="String(i)"
            role="assistant"
            :parts="[{ type: 'text', text: '' }]"
            side="left"
          >
            <template #content>
              <div class="space-y-2">
                <!-- Tool chips -->
                <div v-if="msg.tools?.length" class="flex flex-col gap-1">
                  <UChatTool
                    v-for="(tool, ti) in msg.tools"
                    :key="ti"
                    :text="tool.label"
                    :loading="!tool.done"
                  />
                </div>
                <!-- Text -->
                <!-- eslint-disable vue/no-v-html -->
                <div
                  v-if="msg.text"
                  class="text-sm leading-relaxed"
                  v-html="renderMarkdown(msg.text)"
                />
                <!-- eslint-enable vue/no-v-html -->
                <!-- Place preview / confirm card -->
                <div
                  v-if="msg.placePreview"
                  class="mt-2 flex items-start gap-3 rounded-xl border border-default bg-elevated px-4 py-3"
                >
                  <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <UIcon name="i-heroicons-map-pin" class="size-4" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[13px] font-semibold text-highlighted">{{ msg.placePreview.name }}</p>
                    <p class="mt-0.5 text-[12px] leading-relaxed text-muted">{{ msg.placePreview.address }}</p>
                    <p v-if="msg.placePreview.phone" class="mt-0.5 text-[12px] text-muted">{{ msg.placePreview.phone }}</p>
                    <a
                      v-if="msg.placePreview.mapsUrl"
                      :href="msg.placePreview.mapsUrl"
                      target="_blank"
                      rel="noopener"
                      class="mt-1 inline-flex items-center gap-1 text-[11.5px] text-primary hover:underline"
                    >
                      <UIcon name="i-heroicons-arrow-top-right-on-square" class="size-3" />
                      View on Google Maps
                    </a>
                  </div>
                </div>
                <!-- Handoff card -->
                <div
                  v-if="msg.handoff"
                  class="mt-2 flex items-start gap-3 rounded-xl border border-default bg-elevated px-4 py-3"
                >
                  <div class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <UIcon name="i-heroicons-chat-bubble-left-right" class="size-4" />
                  </div>
                  <div>
                    <p class="text-[13px] font-semibold text-highlighted">Three ways to keep building</p>
                    <p class="mt-0.5 text-[12px] text-muted leading-relaxed">
                      Chat with ChowBot in your dashboard, use the structured editor for precise control, or pick it back up in ChatGPT — same site, same words.
                    </p>
                  </div>
                </div>
              </div>
            </template>
          </UChatMessage>
        </template>
      </UChatMessages>
    </div>

    <!-- Composer -->
    <div v-if="step !== 'welcome'" class="shrink-0 border-t border-default bg-default px-[18px] pb-4 pt-[14px]">

      <!-- Error banner -->
      <div
        v-if="importError"
        class="mb-3 flex items-center gap-2 rounded-lg border border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-950 px-3 py-2 text-xs text-error-600 dark:text-error-400"
      >
        <UIcon name="i-heroicons-exclamation-triangle" class="size-3.5 shrink-0" />
        <span>{{ importError }}</span>
        <button class="ml-auto shrink-0 underline underline-offset-2" @click="retryImport">Try again</button>
      </div>

      <!-- Quick-reply chips (shown when waiting for a selection, not text input) -->
      <div v-if="replies.length > 0 && !typing && !importError && !awaitingInput" class="mb-3 flex flex-wrap gap-2">
        <button
          v-for="(reply, i) in replies"
          :key="i"
          :class="[
            'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors',
            reply.primary
              ? 'border-primary bg-primary text-white hover:bg-primary/90'
              : reply.ghost
                ? 'border-transparent bg-transparent text-muted hover:border-default hover:text-highlighted'
                : 'border-default bg-elevated text-highlighted hover:border-primary hover:text-primary',
          ]"
          @click="handleReply(reply)"
        >
          <UIcon v-if="reply.icon" :name="reply.icon" class="size-3.5" />
          <span class="flex flex-col items-start leading-tight">
            <span>{{ reply.label }}</span>
            <span v-if="reply.sub" class="text-[10.5px] font-medium opacity-70">{{ reply.sub }}</span>
          </span>
        </button>
      </div>

      <!-- Text input: only rendered when the bot is waiting for typed input -->
      <UChatPrompt
        v-if="awaitingInput"
        v-model="textInput"
        :placeholder="inputPlaceholder"
        :loading="typing"
        :maxrows="4"
        autofocus
        @submit="handleTextSubmit"
      >
        <template #trailing>
          <UButton
            icon="i-heroicons-paper-airplane"
            color="primary"
            variant="solid"
            size="xs"
            :disabled="typing || !textInput.trim()"
            type="submit"
          />
        </template>
      </UChatPrompt>
    </div>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked'

interface WizardMessage {
  id: string
  from: 'bot' | 'user'
  text?: string
  tools?: { label: string; done: boolean }[]
  handoff?: boolean
  placePreview?: { name: string; address: string; phone?: string | null; mapsUrl?: string | null }
}

interface QuickReply {
  label: string
  sub?: string
  icon?: string
  primary?: boolean
  ghost?: boolean
  action?: string
}

type WizardStep = 'welcome' | 'vertical' | 'source' | 'awaiting_url' | 'awaiting_search' | 'awaiting_manual_name' | 'confirm' | 'importing' | 'imported'
type Vertical = 'restaurant' | 'experience'

const props = defineProps<{
  siteId: string | null
  existingOrgSlug?: string | null
  setupEndpoint?: string
  setupManualEndpoint?: string
  skipVertical?: boolean
}>()

const emit = defineEmits<{
  'site-created': [orgSlug: string | null, locationSlug?: string | null]
}>()

const router = useRouter()
const toast = useToast()

const WELCOME_POINTS: [string, string][] = [
  ['i-heroicons-globe-alt', 'Pulls your address, hours, photos & reviews from Google'],
  ['i-heroicons-sparkles', 'Builds your homepage and story as you watch'],
  ['i-heroicons-rocket-launch', 'Launches free on a krabiclaw.com address when you are ready'],
]

// ─── State ───────────────────────────────────────────────────────────────────

const step = ref<WizardStep>('welcome')
const messages = ref<WizardMessage[]>([])
const typing = ref(false)
const replies = ref<QuickReply[]>([])
const awaitingInput = ref(false)
const textInput = ref('')
const importError = ref<string | null>(null)
const pendingMapsUrl = ref('')
const pendingPreview = ref<{ placeId: string; name: string; address: string; phone?: string | null; mapsUrl?: string | null } | null>(null)
const selectedVertical = ref<Vertical>('restaurant')

// Drag support
const dragCounter = ref(0)
const isDragging = computed(() => dragCounter.value > 0)

const inputPlaceholder = computed(() => {
  if (step.value === 'awaiting_search') return 'Paste your Facebook link or type your business name…'
  if (step.value === 'awaiting_manual_name') return 'Your business name…'
  return 'Paste your Google Maps link…'
})

const scrollRef = ref<HTMLElement | null>(null)
const importedOrgSlug = ref<string | null>(null)
const preConfirmStep = ref<WizardStep>('awaiting_url')

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _dompurify: { sanitize: (_s: string) => string } = { sanitize: (_s: string) => _s }
onMounted(async () => {
  if (import.meta.client) {
    const { default: dp } = await import('isomorphic-dompurify')
    _dompurify = dp
  }
  // If the user already has a site (returning to onboarding workspace), skip to imported state
  if (props.siteId && props.existingOrgSlug) {
    step.value = 'imported'
    messages.value.push({
      id: crypto.randomUUID(),
      from: 'bot',
      text: "Welcome back. Your workspace is live — the preview is on the right.",
    })
    replies.value = [
      { label: 'Open my dashboard', icon: 'i-heroicons-arrow-right', primary: true, action: 'dashboard' },
    ]
  }
})

function renderMarkdown(text: string): string {
  const html = marked.parse(text, { breaks: true, gfm: true }) as string
  return _dompurify.sanitize(html)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function pushUser(text: string) {
  messages.value.push({ id: crypto.randomUUID(), from: 'user', text })
}

async function pushBot(text: string, extra?: { tools?: { label: string; done: boolean }[]; handoff?: boolean; placePreview?: WizardMessage['placePreview'] }) {
  typing.value = true
  await sleep(560)
  typing.value = false
  messages.value.push({ id: crypto.randomUUID(), from: 'bot', text, ...extra })
  await sleep(80)
  await scrollBottom()
}

async function scrollBottom() {
  await nextTick()
  if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
}

watch([messages, typing], scrollBottom)

// ─── State machine ────────────────────────────────────────────────────────────

async function advance(target: WizardStep) {
  step.value = target
  replies.value = []
  awaitingInput.value = false
  importError.value = null

  if (target === 'vertical') {
    await pushBot("First — what kind of business is this?")
    replies.value = [
      { label: 'Restaurant, café or bar', icon: 'i-heroicons-fire', primary: true, action: 'set_vertical_restaurant' },
      { label: 'Experience, class or activity', icon: 'i-heroicons-academic-cap', action: 'set_vertical_experience' },
    ]
  }

  if (target === 'source') {
    await pushBot("Got it. How would you like to add your business details?")
    replies.value = [
      { label: 'Google Maps', sub: 'Paste your Maps link', icon: 'i-heroicons-globe-alt', primary: true, action: 'ask_url' },
      { label: 'Facebook', sub: 'Paste your page link', icon: 'i-heroicons-globe-alt', action: 'ask_facebook' },
      { label: 'Start manually', sub: 'Type your business name', icon: 'i-heroicons-pencil', action: 'ask_manual' },
    ]
  }

  if (target === 'awaiting_url') {
    await pushBot("Paste your Google Maps link below — the full URL from your browser or a short maps.app.goo.gl link both work.")
    awaitingInput.value = true
  }

  if (target === 'awaiting_search') {
    await pushBot("Paste your Facebook page link, or just type your business name — I'll find you on Google.")
    awaitingInput.value = true
  }

  if (target === 'awaiting_manual_name') {
    await pushBot("What's the name of your business?")
    awaitingInput.value = true
  }
}

async function handleReply(reply: QuickReply) {
  if (reply.action === 'set_vertical_restaurant') {
    selectedVertical.value = 'restaurant'
    pushUser(reply.label)
    await advance('source')
    return
  }

  if (reply.action === 'set_vertical_experience') {
    selectedVertical.value = 'experience'
    pushUser(reply.label)
    await advance('source')
    return
  }

  if (reply.action === 'ask_url') {
    pushUser(reply.label)
    await advance('awaiting_url')
    return
  }

  if (reply.action === 'ask_facebook') {
    pushUser(reply.label)
    await advance('awaiting_search')
    return
  }

  if (reply.action === 'ask_manual') {
    pushUser(reply.label)
    await advance('awaiting_manual_name')
    return
  }

  if (reply.action === 'confirm_yes') {
    pushUser("Yes, that's my place")
    if (pendingPreview.value) await runSetup(pendingPreview.value.placeId)
    return
  }

  if (reply.action === 'confirm_no') {
    pushUser("That's not my place")
    pendingPreview.value = null
    await advance(preConfirmStep.value)
    return
  }

  if (reply.action === 'dashboard') {
    const slug = importedOrgSlug.value ?? props.existingOrgSlug
    if (slug) {
      await markOnboardingComplete()
      await router.push(`/dashboard/${slug}`)
    }
    return
  }

  if (reply.action === 'add_location') {
    const slug = importedOrgSlug.value ?? props.existingOrgSlug
    await markOnboardingComplete()
    await router.push(slug ? `/dashboard/${slug}/new` : '/dashboard')
    return
  }
}

async function handleTextSubmit() {
  const input = textInput.value.trim()
  if (!awaitingInput.value || !input) return
  textInput.value = ''
  awaitingInput.value = false
  replies.value = []
  pushUser(input)
  if (step.value === 'awaiting_url') {
    await runLookup(input)
  } else if (step.value === 'awaiting_search') {
    await runSearch(input)
  } else if (step.value === 'awaiting_manual_name') {
    await runManualSetup(input)
  }
}

// ─── Import flow ──────────────────────────────────────────────────────────────

async function showLookupTools(label: string): Promise<{ label: string; done: boolean }[]> {
  const tools = reactive([{ label, done: false }])
  typing.value = true
  await sleep(400)
  typing.value = false
  messages.value.push({ id: crypto.randomUUID(), from: 'bot', tools })
  await scrollBottom()
  return tools
}

function showConfirm(preview: NonNullable<typeof pendingPreview.value>, returnStep: WizardStep) {
  preConfirmStep.value = returnStep
  pendingPreview.value = preview
  step.value = 'confirm'
  replies.value = [
    { label: "Yes, that's my place", icon: 'i-heroicons-check', primary: true, action: 'confirm_yes' },
    { label: "That's not my place", icon: 'i-heroicons-x-mark', action: 'confirm_no' },
  ]
}

async function runLookup(mapsUrl: string) {
  step.value = 'importing'
  pendingMapsUrl.value = mapsUrl
  importError.value = null
  const tools = await showLookupTools('Looking up your Google Maps listing…')

  try {
    const res = await $fetch<{
      success: boolean
      preview?: { placeId: string; name: string; address: string; phone?: string | null; mapsUrl?: string | null }
      error?: string
    }>('/api/dashboard/onboarding/setup', { method: 'POST', body: { mapsUrl, previewOnly: true } })

    if (!res.success || !res.preview) {
      throw new Error(res.error ?? 'Could not find your business. Please check the Google Maps URL and try again.')
    }

    tools[0]!.done = true
    await pushBot("Found it — does this look right?", { placePreview: res.preview })
    showConfirm(res.preview, 'awaiting_url')
  } catch (err) {
    importError.value = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    step.value = 'awaiting_url'
    awaitingInput.value = true
  }
}

async function runSearch(query: string) {
  step.value = 'importing'
  importError.value = null
  const tools = await showLookupTools('Searching Google for your business…')

  try {
    const res = await $fetch<{
      success: boolean
      preview?: { placeId: string; name: string; address: string; phone?: string | null; mapsUrl?: string | null }
      error?: string
    }>('/api/dashboard/onboarding/search-place', { method: 'POST', body: { query } })

    if (!res.success || !res.preview) {
      throw new Error(res.error ?? 'Could not find your business. Try a more specific name.')
    }

    tools[0]!.done = true
    await pushBot("Found it — does this look right?", { placePreview: res.preview })
    showConfirm(res.preview, 'awaiting_search')
  } catch (err) {
    importError.value = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    step.value = 'awaiting_search'
    awaitingInput.value = true
  }
}

async function runSetup(placeId: string) {
  step.value = 'importing'
  importError.value = null
  const tools = await showLookupTools('Creating your workspace…')

  try {
    const endpoint = props.setupEndpoint ?? '/api/dashboard/onboarding/setup'
    const res = await $fetch<{
      success: boolean
      placeName?: string
      orgSlug?: string | null
      locationSlug?: string | null
      error?: string
    }>(endpoint, { method: 'POST', body: { placeId, vertical: selectedVertical.value } })

    if (!res.success) {
      throw new Error(res.error ?? 'Failed to create your workspace. Please try again.')
    }

    tools[0]!.done = true
    importedOrgSlug.value = res.orgSlug ?? null
    await finishCreation(res.orgSlug, res.locationSlug)
  } catch (err) {
    importError.value = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    step.value = preConfirmStep.value
    awaitingInput.value = true
  }
}

async function runManualSetup(name: string) {
  step.value = 'importing'
  importError.value = null
  const tools = await showLookupTools('Creating your workspace…')

  try {
    const endpoint = props.setupManualEndpoint ?? '/api/dashboard/onboarding/setup-manual'
    const res = await $fetch<{
      success: boolean
      orgSlug?: string | null
      error?: string
    }>(endpoint, { method: 'POST', body: { name, vertical: selectedVertical.value } })

    if (!res.success) {
      throw new Error(res.error ?? 'Failed to create your workspace. Please try again.')
    }

    tools[0]!.done = true
    importedOrgSlug.value = res.orgSlug ?? null
    await finishCreation(res.orgSlug, (res as { locationSlug?: string | null }).locationSlug)
  } catch (err) {
    importError.value = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
    step.value = 'awaiting_manual_name'
    awaitingInput.value = true
  }
}

async function finishCreation(orgSlug: string | null | undefined, locationSlug?: string | null) {
  emit('site-created', orgSlug ?? null, locationSlug ?? null)
  await sleep(300)
  const domain = orgSlug ? `**${orgSlug}.krabiclaw.com**` : 'your new workspace'
  const offerLabel = selectedVertical.value === 'experience' ? 'experiences' : 'menu'
  await pushBot(`Done. Your workspace is live at ${domain}.`)
  await pushBot(
    `Head to your dashboard to keep building — add your ${offerLabel}, hero image and story — or connect ChatGPT to manage it from there.`,
    { handoff: true },
  )
  step.value = 'imported'
  replies.value = [
    { label: 'Open my dashboard', icon: 'i-heroicons-arrow-right', primary: true, action: 'dashboard' },
    { label: 'Add another location', icon: 'i-heroicons-map-pin', action: 'add_location' },
  ]
}

function retryImport() {
  importError.value = null
  if (step.value === 'awaiting_url' && pendingMapsUrl.value) {
    runLookup(pendingMapsUrl.value)
  }
}

async function markOnboardingComplete() {
  await $fetch('/api/dashboard/onboarding/complete', { method: 'POST' }).catch(() => {})
}

// ─── Drag & drop (no-op for now, future: attach files) ───────────────────────

const onDrop = (e: DragEvent) => {
  dragCounter.value = 0
  const file = e.dataTransfer?.files[0]
  if (!file) return
  toast.add({ description: 'File uploads are available after your site is created.', color: 'neutral' })
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
