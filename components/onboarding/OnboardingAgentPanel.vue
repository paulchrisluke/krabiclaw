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
        v-if="isDragging"
        class="absolute inset-0 z-10 flex items-center justify-center"
      >
        <UCard :ui="{ root: 'border-2 border-dashed border-primary mx-8', body: 'px-8 py-10 sm:px-8 sm:py-10' }">
          <div class="flex flex-col items-center gap-3 text-center">
            <UIcon name="i-heroicons-arrow-up-tray" class="size-10 text-primary" />
            <p class="font-medium text-highlighted">Drop menu image or PDF</p>
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
      <UTooltip v-if="!isDepleted && balance !== null" :text="`${balance} credits remaining`">
        <UBadge color="neutral" variant="subtle" size="sm" class="tabular-nums">
          {{ (total !== null ? total - balance : 0).toLocaleString() }} / {{ (total ?? balance ?? 0).toLocaleString() }}
        </UBadge>
      </UTooltip>
    </div>

    <!-- Depleted / low credits -->
    <div v-if="isDepleted" class="shrink-0 border-b border-error-200 dark:border-error-800 bg-error-50 dark:bg-error-950 px-4 py-3 flex flex-col gap-2">
      <div class="flex items-center gap-2 text-xs text-error-600 dark:text-error-400">
        <UIcon name="i-heroicons-exclamation-triangle" class="size-3.5 shrink-0" />
        <span class="font-medium">No AI credits remaining</span>
      </div>
      <div class="flex gap-2">
        <UButton size="xs" color="error" variant="solid" :loading="buyingCredits === 500" :disabled="!!buyingCredits" @click="purchaseCredits(500)">500 — $9</UButton>
        <UButton size="xs" color="error" variant="soft" :loading="buyingCredits === 2500" :disabled="!!buyingCredits" @click="purchaseCredits(2500)">2,500 — $29</UButton>
        <UButton size="xs" color="error" variant="soft" :loading="buyingCredits === 5000" :disabled="!!buyingCredits" @click="purchaseCredits(5000)">5,000 — $49</UButton>
      </div>
    </div>

    <!-- Scroll area -->
    <div ref="scrollRef" class="min-h-0 flex-1 overflow-y-auto">
      <!-- Welcome state (no messages, has site) -->
      <div v-if="isWelcome" class="flex flex-col gap-[18px] p-6 pb-4">
        <div class="flex size-16 items-center justify-center rounded-[18px] bg-primary/10 text-primary">
          <UIcon name="i-heroicons-sparkles" class="size-8" />
        </div>
        <div>
          <p class="mb-1 text-[11px] font-bold uppercase tracking-[0.28em] text-primary">Let's build your site</p>
          <h1 class="text-3xl font-extrabold leading-tight tracking-tight text-highlighted">
            Tell me about your restaurant. I'll do the typing.
          </h1>
        </div>
        <p class="text-[14.5px] leading-relaxed text-muted">
          This is the quick way in. Answer a few questions and a real, SEO-ready site builds itself on the right — you decide what to keep.
        </p>
        <div class="flex flex-col gap-2.5">
          <div v-for="[icon, text] in welcomePoints" :key="text" class="flex items-center gap-3 text-sm text-highlighted">
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
          @click="startBuilding"
        >
          Start building
        </UButton>
      </div>

      <!-- Setup state (no site yet) -->
      <div v-else-if="isSetup" class="flex h-full flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <UIcon name="i-heroicons-sparkles" class="size-8 text-primary opacity-60" />
        <p class="text-sm font-medium text-highlighted">Let's get your restaurant started</p>
        <p class="text-xs text-muted">Choose a starting point. I'll create the workspace, then keep going from here.</p>
        <div class="mt-4 flex w-full flex-col gap-2">
          <UButton
            v-for="prompt in setupStarterPrompts"
            :key="prompt"
            color="neutral"
            variant="outline"
            size="sm"
            class="justify-start text-left"
            @click="handleStarter(prompt)"
          >
            {{ prompt }}
          </UButton>
        </div>
      </div>

      <!-- Messages -->
      <UChatMessages v-else :status="isLoading ? 'streaming' : undefined" class="p-5">
        <UChatMessage
          v-for="(msg, i) in messages"
          :key="i"
          :id="String(i)"
          :role="msg.role"
          :parts="[{ type: 'text', text: msg.content }]"
          :side="msg.role === 'user' ? 'right' : 'left'"
        >
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
            </div>
            <div v-else>{{ msg.content }}</div>
          </template>
        </UChatMessage>
      </UChatMessages>
    </div>

    <!-- Composer (hidden on welcome/setup state) -->
    <div v-if="!isWelcome && !isSetup" class="shrink-0 border-t border-default bg-default px-[18px] pb-4 pt-[14px]">
      <!-- pending file chip -->
      <div v-if="pendingFile" class="mb-2 flex items-center gap-2 rounded-lg border border-default bg-elevated px-3 py-1.5">
        <UIcon name="i-heroicons-paper-clip" class="size-3.5 shrink-0 text-muted" />
        <span class="min-w-0 flex-1 truncate text-xs">{{ pendingFile.name }}</span>
        <UButton icon="i-heroicons-x-mark" size="xs" color="neutral" variant="ghost" class="shrink-0" @click="pendingFile = null" />
      </div>

      <!-- Onboarding quick-reply chips -->
      <div v-if="onboardingReplies.length > 0 && !isLoading" class="mb-3 flex flex-wrap gap-2">
        <button
          v-for="(reply, i) in onboardingReplies"
          :key="i"
          :class="[
            'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors',
            reply.primary
              ? 'border-primary bg-primary text-white hover:bg-primary/90'
              : reply.ghost
              ? 'border-transparent bg-transparent text-muted hover:border-default hover:text-highlighted'
              : 'border-default bg-elevated text-highlighted hover:border-primary hover:text-primary'
          ]"
          @click="handleQuickReply(reply)"
        >
          <UIcon v-if="reply.icon" :name="reply.icon" class="size-3.5" />
          {{ reply.label }}
        </button>
      </div>

      <UChatPrompt
        v-model="input"
        :placeholder="isDepleted ? 'Purchase credits above to continue…' : pendingFile ? 'Add a caption (optional)…' : 'Or just type your answer…'"
        :disabled="isLoading || isUploading || isDepleted"
        :loading="isLoading || isUploading"
        :maxrows="8"
        @submit="handleSubmit"
      />
      <div class="mt-2 flex items-center gap-2">
        <UTooltip text="Attach menu image or PDF">
          <UButton
            icon="i-heroicons-paper-clip"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="isLoading || isUploading || !siteId || isDepleted"
            @click="fileInputRef?.click()"
          />
        </UTooltip>
        <span v-if="isUploading" class="text-xs text-muted">Extracting menu…</span>
      </div>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      class="hidden"
      accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,.txt"
      @change="handleFileInput"
    />
  </div>
</template>

<script setup lang="ts">
import { useChowBot } from '~/composables/useChowBot'
import { useAiCredits } from '~/composables/useAiCredits'
import { useCreditPurchase } from '~/composables/useCreditPurchase'
import { marked } from 'marked'

interface QuickReply {
  label: string
  primary?: boolean
  ghost?: boolean
  icon?: string
}

interface MenuExtractionResponse {
  error?: string
  menuItems?: unknown[]
}

const props = defineProps<{
  siteId: string | null
  setupMode?: boolean
}>()

const DOMPurify = import.meta.client
  ? (await import('isomorphic-dompurify')).default
  : { sanitize: (s: string) => s }

const { messages, isLoading, sendMessage, currentPageOverride } = useChowBot()
const { balance, total, isLow: _isLow, isDepleted, fetch: fetchCredits } = useAiCredits(
  computed(() => props.siteId)
)

// Set onboarding mode context
onMounted(() => {
  currentPageOverride.value = 'onboarding'
  if (props.siteId) fetchCredits()
})

onUnmounted(() => {
  currentPageOverride.value = null
})

const isWelcome = computed(() => messages.value.length === 0 && !!props.siteId && !props.setupMode)
const isSetup = computed(() => !props.siteId || props.setupMode)

const welcomePoints: [string, string][] = [
  ['i-heroicons-globe-alt', 'Pulls your address, hours, photos & reviews from Google'],
  ['i-heroicons-sparkles', 'Drafts a homepage, menu and story you can watch build'],
  ['i-heroicons-rocket-launch', 'Launches free on a krabiclaw.com address when you are ready'],
]

const setupStarterPrompts = [
  'Start from Google Business',
  'Start from Facebook or Instagram',
  'Build manually with ChowBot',
]

// Context-aware quick replies for guided onboarding phases
const onboardingReplies = computed<QuickReply[]>(() => {
  if (!messages.value.length || isLoading.value) return []
  const lastMsg = messages.value[messages.value.length - 1]
  // Only show replies after assistant messages
  if (lastMsg?.role !== 'assistant') return []
  return []
})

const startBuilding = () => {
  sendMessage("Let's start building my site. What do you need from me first?")
}

const handleStarter = (prompt: string) => {
  input.value = prompt
  handleSubmit()
}

const handleQuickReply = (reply: { label: string; primary?: boolean; ghost?: boolean; icon?: string }) => {
  sendMessage(reply.label)
}

// --- input / file ---
const input = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingFile = ref<File | null>(null)
const isUploading = ref(false)
const dragCounter = ref(0)
const isDragging = computed(() => dragCounter.value > 0)
const buyingCredits = ref<number | null>(null)
const scrollRef = ref<HTMLElement | null>(null)

watch([messages, isLoading], async () => {
  await nextTick()
  const el = scrollRef.value
  if (el) el.scrollTop = el.scrollHeight
})

const { purchase: purchaseCreditsFn } = useCreditPurchase()

async function purchaseCredits(bundle: 500 | 2500 | 5000) {
  buyingCredits.value = bundle
  try {
    await purchaseCreditsFn(bundle, async () => { await fetchCredits() })
  } finally {
    buyingCredits.value = null
  }
}

const handleSubmit = async () => {
  const text = input.value.trim()
  if (!text && !pendingFile.value) return
  input.value = ''

  if (pendingFile.value) {
    const file = pendingFile.value
    pendingFile.value = null
    await processFile(file, text)
  } else {
    await sendMessage(text)
  }
}

const onDrop = (e: DragEvent) => {
  dragCounter.value = 0
  if (!props.siteId || isDepleted.value) return
  const file = e.dataTransfer?.files[0]
  if (file) stageFile(file)
}

const handleFileInput = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) stageFile(file)
  if (fileInputRef.value) fileInputRef.value.value = ''
}

const stageFile = (file: File) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
  if (!allowed.includes(file.type.toLowerCase())) return
  if (file.size > 10 * 1024 * 1024) return
  pendingFile.value = file
}

const processFile = async (file: File, caption = '') => {
  if (!props.siteId) return
  const label = caption ? `📎 ${file.name} — ${caption}` : `📎 ${file.name}`
  messages.value = [...messages.value, { role: 'user', content: label }]
  isUploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    if (caption) formData.append('menuName', caption)
    const raw = await fetch(`/api/ai/${props.siteId}/menu/extract`, { method: 'POST', body: formData })
    const json = await raw.json().catch(() => null) as MenuExtractionResponse | null
    if (!raw.ok) throw new Error(json?.error ?? `Upload failed (${raw.status})`)
    const count = json?.menuItems?.length ?? 0
    messages.value = [...messages.value, {
      role: 'assistant',
      content: count > 0
        ? `Extracted **${count} menu item${count === 1 ? '' : 's'}** saved as a draft. Go to **Menu** in the dashboard to review and publish.`
        : 'No items found in that file. Try a higher-resolution photo.',
    }]
  } catch (err) {
    messages.value = [...messages.value, {
      role: 'assistant',
      content: err instanceof Error ? err.message : 'Menu extraction failed. Please try again.',
      error: true,
    }]
  } finally {
    isUploading.value = false
  }
}

// --- tool labels ---
const toolLabel = (name: string): string => {
  const labels: Record<string, string> = {
    get_posts: 'Fetching posts…', create_post: 'Creating post…', publish_post: 'Publishing post…',
    get_menu: 'Loading menu…', get_site_stats: 'Checking stats…', rename_site: 'Renaming site…',
    get_locations: 'Fetching locations…', create_location: 'Creating location…', update_location: 'Updating location…',
    add_menu_item: 'Adding menu item…', add_menu_items_batch: 'Adding menu items…', sync_menu_items: 'Updating menu items…',
    update_menu_item: 'Updating menu item…', delete_menu_item: 'Deleting menu item…',
    delete_menu_section: 'Deleting menu section…', publish_menu: 'Publishing menu…',
    delete_menu: 'Deleting menu…', create_menu: 'Creating menu…', rename_menu: 'Renaming menu…',
    set_default_currency: 'Updating currency…', rename_menu_section: 'Renaming menu section…',
    get_reviews: 'Fetching reviews…', reply_to_review: 'Saving reply…',
    get_location_media: 'Fetching media…', delete_media_asset: 'Deleting media…',
    generate_image: 'Generating image with AI…', get_location_qa: 'Fetching Q&A…',
    add_qa: 'Adding Q&A…', delete_qa: 'Deleting Q&A…',
    lookup_maps_url: 'Looking up Google Maps…', import_reviews: 'Importing reviews…',
    select_photos: 'Selecting photos…', launch_site: 'Publishing site…',
    save_brand_description: 'Saving brand description…', extract_menu: 'Extracting menu…',
  }
  return labels[name] ?? name
}

function renderMarkdown(text: string): string {
  const html = marked.parse(text, {
    breaks: true,
    gfm: true,
  })
  if (import.meta.server) return html
  return DOMPurify.sanitize(html)
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
