<template>
  <Transition name="chowbot-panel">
    <div
      v-if="embedded || isOpen"
      :class="[
        'flex flex-col bg-default',
        embedded ? 'h-full min-h-0 w-full' : 'w-96 shrink-0 border-l border-default'
      ]"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <!-- drag-drop overlay -->
      <Transition name="fade">
        <div
          v-if="isDragging"
          class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded bg-default/95 text-center"
        >
          <UCard :ui="{ root: 'border-2 border-dashed border-primary mx-8 my-10', body: 'px-8 py-10 sm:px-8 sm:py-10' }">
            <div class="flex flex-col items-center gap-3">
              <UIcon name="i-heroicons-arrow-up-tray" class="size-10 text-primary" />
              <p class="font-medium">Drop menu image or PDF</p>
              <p class="text-xs text-muted">JPEG, PNG, WEBP, PDF or TXT — max 10 MB</p>
            </div>
          </UCard>
        </div>
      </Transition>

      <div class="flex shrink-0 items-center justify-between border-b border-default px-4 py-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-bot" class="size-4 text-primary" />
          <span class="text-sm font-semibold">ChowBot</span>
          <UTooltip v-if="balance !== null" :text="`${balance} credits remaining`">
            <UBadge
              :color="isDepleted ? 'error' : isLow ? 'warning' : 'neutral'"
              variant="subtle"
              size="sm"
              class="cursor-default tabular-nums"
            >
              {{ (total !== null ? total - balance : 0).toLocaleString() }} / {{ (total ?? balance).toLocaleString() }}
            </UBadge>
          </UTooltip>
        </div>
        <div class="flex items-center gap-1">
          <UTooltip text="New conversation">
            <UButton
              icon="i-heroicons-plus"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="!messages.length"
              @click="handleClearMessages"
            />
          </UTooltip>
          <UButton
            v-if="!embedded"
            icon="i-heroicons-x-mark"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="close"
          />
        </div>
      </div>

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
      <div v-else-if="isLow" class="shrink-0 bg-warning-50 dark:bg-warning-950 px-4 py-2 text-xs text-warning-600 dark:text-warning-400 flex items-center gap-2">
        <UIcon name="i-heroicons-exclamation-triangle" class="size-3.5 shrink-0" />
        Low credits ({{ balance }} remaining). <NuxtLink :to="orgSettings.billing.value" class="underline" @click="close">Top up →</NuxtLink>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto">
        <UChatMessages :status="isUploading ? 'submitted' : undefined">
          <div
            v-if="messages.length === 0"
            class="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center"
          >
            <UIcon name="i-lucide-bot" class="size-8 text-primary opacity-60" />
            <p class="text-sm font-medium">{{ emptyTitle }}</p>
            <p class="text-xs text-muted">{{ emptyDescription }}</p>
            <div class="mt-4 flex w-full flex-col gap-2">
              <UButton
                v-for="prompt in starterPrompts"
                :key="prompt"
                color="neutral"
                variant="outline"
                size="xs"
                class="justify-start text-left"
                @click="handleStarter(prompt)"
              >
                {{ prompt }}
              </UButton>
            </div>
          </div>

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
                <!-- Running tools appear first while streaming -->
                <div v-if="msg.toolCalls?.length" class="flex flex-col gap-1">
                  <UChatTool
                    v-for="(tool, ti) in msg.toolCalls"
                    :key="tool.name + i + ti"
                    :text="toolLabel(tool.name)"
                    :loading="tool.status === 'running'"
                  />
                </div>
                <!-- Message text (empty while tools are still running) -->
                <!-- eslint-disable vue/no-v-html -->
                <div
                  v-if="msg.content"
                  class="prose prose-sm dark:prose-invert max-w-none"
                  v-html="renderMarkdown(msg.content)"
                />
                <!-- eslint-enable vue/no-v-html -->
              </div>
              <div v-else class="prose prose-sm dark:prose-invert max-w-none">
                {{ msg.content }}
              </div>
            </template>
          </UChatMessage>
        </UChatMessages>
      </div>

      <div class="shrink-0 border-t border-default p-3">
        <!-- pending text chip -->
        <div v-if="pendingText" class="mb-2 flex items-center gap-2 rounded-lg border border-default bg-elevated px-3 py-1.5">
          <UIcon name="i-heroicons-document-text" class="size-3.5 shrink-0 text-muted" />
          <span class="min-w-0 flex-1 truncate text-xs">{{ pendingText.name }} — {{ pendingText.content.length.toLocaleString() }} chars</span>
          <UButton
            icon="i-heroicons-x-mark"
            size="xs"
            color="neutral"
            variant="ghost"
            class="shrink-0"
            @click="pendingText = null"
          />
        </div>

        <!-- pending file chip -->
        <div v-if="pendingFile" class="mb-2 flex items-center gap-2 rounded-lg border border-default bg-elevated px-3 py-1.5">
          <UIcon name="i-heroicons-paper-clip" class="size-3.5 shrink-0 text-muted" />
          <span class="min-w-0 flex-1 truncate text-xs">{{ pendingFile.name }}</span>
          <UButton
            icon="i-heroicons-x-mark"
            size="xs"
            color="neutral"
            variant="ghost"
            class="shrink-0"
            @click="pendingFile = null"
          />
        </div>

        <UChatPrompt
          v-model="input"
          :placeholder="promptPlaceholder"
          :disabled="isLoading || isUploading || creatingRestaurant || (!siteId && !setupMode) || isDepleted"
          :loading="isLoading || isUploading || creatingRestaurant"
          :maxrows="8"
          @submit="handleSubmit"
        />
        <div class="mt-1 flex items-center justify-end gap-2">
          <p v-if="input.length > 1000" class="text-right text-xs" :class="input.length > 20000 ? 'text-warning' : 'text-muted'">
            {{ input.length.toLocaleString() }} chars{{ input.length > 20000 ? ' — will be truncated' : '' }}
          </p>
          <UButton
            v-if="input.length > 3000 && !pendingText"
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-heroicons-paper-clip"
            @click="convertToAttachment"
          >
            Attach as file
          </UButton>
        </div>
        <div class="mt-2 flex items-center gap-2">
          <UTooltip text="Attach menu image or PDF">
            <UButton
              icon="i-heroicons-paper-clip"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="isLoading || isUploading || !siteId || isDepleted || setupMode"
              @click="fileInputRef?.click()"
            />
          </UTooltip>
          <span v-if="isUploading" class="text-xs text-muted">Extracting menu…</span>
          <span v-else-if="siteId && !setupMode" class="text-xs text-muted">or drag & drop a menu file anywhere</span>
        </div>
        <p v-if="!siteId && !setupMode" class="mt-2 text-center text-xs text-muted">
          Create your workspace to use ChowBot.
        </p>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        class="hidden"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,.txt"
        @change="handleFileInput"
      />
    </div>
  </Transition>
</template>

<script setup lang="ts">
// -nocheck
import { useChowBot } from '~/composables/useChowBot'
import { useAiCredits } from '~/composables/useAiCredits'
import { getQuickActionPrompts } from '~/composables/useOnboardingPrompts'
import type { SiteVertical } from '~/utils/vertical-copy'

const props = defineProps<{ embedded?: boolean; setupMode?: boolean }>()
const setupMode = computed(() => Boolean(props.setupMode))

const dashboard = useDashboardSite()
const { isOpen, messages, isLoading, siteId, close, sendMessage, clearMessages, currentPageOverride } = useChowBot()
const orgSettings = useOrgSettings()
const DOMPurify = import.meta.client ? (await import('isomorphic-dompurify')).default : { sanitize: (s: string) => s }
const { balance, total, isLow, isDepleted, fetch: fetchCredits } = useAiCredits(siteId)

watch(isOpen, (open: boolean) => { if (open && siteId.value) fetchCredits() })

const buyingCredits = ref<number | null>(null)
const { purchase: purchaseCreditsFn } = useCreditPurchase()

async function purchaseCredits(bundle: 500 | 2500 | 5000) {
  buyingCredits.value = bundle
  try {
    await purchaseCreditsFn(bundle, async () => { await fetchCredits() })
  } finally {
    buyingCredits.value = null
  }
}

const input = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingFile = ref<File | null>(null)
const pendingText = ref<{ name: string; content: string } | null>(null)
const isUploading = ref(false)
const dragCounter = ref(0)
const isDragging = computed(() => dragCounter.value > 0)
const setupStep = ref<'source' | 'vertical' | 'name' | 'subdomain'>('source')
const setupSource = ref<'google' | 'facebook' | 'manual' | null>(null)
const setupVertical = ref<SiteVertical | null>(null)
const setupRestaurantName = ref('')
const setupSubdomain = ref('')
const creatingRestaurant = ref(false)

const regularStarterPrompts = computed(() => getQuickActionPrompts(dashboard.site.value?.vertical))

const setupStarterPrompts = [
  'Start from Google Business',
  'Start from Facebook or Instagram',
  'Build manually with ChowBot',
]

const starterPrompts = computed(() => setupMode.value && !siteId.value ? setupStarterPrompts : regularStarterPrompts.value)
const emptyTitle = computed(() => setupMode.value && !siteId.value ? "Let's get your site started" : 'What can I help with?')
const emptyDescription = computed(() => setupMode.value && !siteId.value
  ? 'Choose a starting point. I will create the workspace, then keep going from here.'
  : 'Ask anything, or drop a menu image to extract it.'
)
const promptPlaceholder = computed(() => {
  if (setupMode.value && !siteId.value) return setupStep.value === 'source' ? 'Tell ChowBot where to start...' : 'Reply to ChowBot...'
  if (isDepleted.value) return 'Purchase credits above to continue...'
  if (pendingFile.value) return 'Add a caption (optional) then press send...'
  if (pendingText.value) return 'Add a note (optional) then press send...'
  return 'Ask ChowBot anything...'
})

function handleClearMessages() {
  clearMessages()
  setupStep.value = 'source'
  setupSource.value = null
  setupVertical.value = null
  setupRestaurantName.value = ''
  setupSubdomain.value = ''
}

const convertToAttachment = () => {
  if (!input.value.trim()) return
  pendingText.value = { name: 'message.txt', content: input.value.trim() }
  input.value = ''
}

const handleSubmit = async () => {
  const text = input.value.trim()
  if (!text && !pendingFile.value && !pendingText.value) return
  input.value = ''
  if (setupMode.value && !siteId.value) {
    pendingFile.value = null
    pendingText.value = null
    await handleSetupMessage(text)
    return
  }
  if (pendingFile.value) {
    const file = pendingFile.value
    pendingFile.value = null
    await processFile(file, text)
  } else if (pendingText.value) {
    const pt = pendingText.value
    pendingText.value = null
    const combined = text ? `${text}\n\n---\n${pt.content}` : pt.content
    await sendMessage(combined)
  } else {
    await sendMessage(text)
  }
}

const handleStarter = (prompt: string) => {
  if (setupMode.value && !siteId.value) {
    handleSetupStarter(prompt)
    return
  }
  input.value = prompt
  handleSubmit()
}

function normalizeSubdomain(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
}

function setupPromptForSource() {
  const businessWord = setupVertical.value === 'experience' ? 'experience' : 'restaurant'
  if (setupSource.value === 'google') {
    return `Help me start from my Google Business profile. I want to set up locations, hours, photos, and ${businessWord} details.`
  }
  if (setupSource.value === 'facebook') {
    return `Help me start from my Facebook or Instagram presence. I want to turn existing social content into my ${businessWord} site.`
  }
  return `Help me build my ${businessWord} manually from scratch. Start by asking for the most important details.`
}

function handleSetupStarter(prompt: string) {
  const lower = prompt.toLowerCase()
  setupSource.value = lower.includes('google') ? 'google' : lower.includes('facebook') ? 'facebook' : 'manual'
  setupStep.value = 'vertical'
  messages.value = [
    ...messages.value,
    { role: 'user', content: prompt },
    {
      role: 'assistant',
      content: 'First, what are you setting up — a restaurant, café, or bar, or a bookable experience like classes, tours, or workshops?',
    },
  ]
}

function handleSetupVerticalReply(text: string) {
  const lower = text.toLowerCase()
  setupVertical.value = /experience|class|tour|workshop|studio|activit|pottery|booking/.test(lower) ? 'experience' : 'restaurant'
  setupStep.value = 'name'
  const nameWord = setupVertical.value === 'experience' ? 'business' : 'restaurant'
  messages.value = [
    ...messages.value,
    { role: 'user', content: text.trim() },
    {
      role: 'assistant',
      content: setupSource.value === 'google'
        ? `Great. First, what is the ${nameWord} name? After I create the workspace, I can help connect Google Business from here.`
        : setupSource.value === 'facebook'
          ? `Perfect. What is the ${nameWord} name? After I create the workspace, I can help connect Meta and turn existing content into the site.`
          : `Easy. What is the ${nameWord} name? I will create the workspace first, then we can build it together step by step.`,
    },
  ]
}

async function handleSetupMessage(text: string) {
  if (!text.trim() || creatingRestaurant.value) return

  if (setupStep.value === 'source') {
    handleSetupStarter(text)
    return
  }

  if (setupStep.value === 'vertical') {
    handleSetupVerticalReply(text)
    return
  }

  if (setupStep.value === 'name') {
    setupRestaurantName.value = text.trim()
    const sub = normalizeSubdomain(text)
    if (!sub) {
      setupStep.value = 'subdomain'
      messages.value = [
        ...messages.value,
        { role: 'user', content: text.trim() },
        {
          role: 'assistant',
          content: 'Please enter a valid name or type a domain/address you would like to use.',
        },
      ]
      return
    }
    setupSubdomain.value = sub
    setupStep.value = 'subdomain'
    messages.value = [
      ...messages.value,
      { role: 'user', content: text.trim() },
      {
        role: 'assistant',
        content: `Got it. I can use **${setupSubdomain.value}.krabiclaw.com** for the site address. Reply **yes** to use that, or type a different address.`,
      },
    ]
    return
  }

  const requestedSubdomain = /^(yes|y|ok|okay|sure)$/i.test(text.trim())
    ? setupSubdomain.value
    : normalizeSubdomain(text)

  if (!requestedSubdomain) {
    messages.value = [
      ...messages.value,
      { role: 'user', content: text.trim() },
      {
        role: 'assistant',
        content: 'That address is invalid. Please type a valid name or subdomain (using letters and numbers).',
      },
    ]
    return
  }

  messages.value = [
    ...messages.value,
    { role: 'user', content: text.trim() },
    { role: 'assistant', content: 'Creating the workspace...', streaming: true },
  ]
  creatingRestaurant.value = true

  try {
    const validation = await $fetch<{ available: boolean; message?: string }>('/api/dashboard/site/validate-subdomain', {
      method: 'POST',
      body: { subdomain: requestedSubdomain }
    })

    if (!validation.available) {
      creatingRestaurant.value = false
      updateSetupLastMessage(validation.message ?? 'That site address is not available. Try another one.', true)
      return
    }

    await $fetch('/api/dashboard/site', {
      method: 'POST',
      body: {
        name: setupRestaurantName.value,
        subdomain: requestedSubdomain,
        vertical: setupVertical.value ?? 'restaurant',
      }
    })

    await dashboard.refresh()
    currentPageOverride.value = 'setup'
    updateSetupLastMessage('Workspace created. I will keep going here.', false)
    await nextTick()
    
    // Add social linking guidance for Facebook/Instagram source
    if (setupSource.value === 'facebook') {
      messages.value = [
        ...messages.value,
        {
          role: 'assistant',
          content: 'Great! Next, let\'s connect your Facebook Page and Instagram Business Account. This will automatically sync your Facebook and Instagram posts to your website - no need to manually create content. Go to **Settings → General** and click **Connect Facebook**. Once connected, your posts will appear on your site within an hour.',
        },
      ]
    } else {
      await sendMessage(setupPromptForSource())
    }
  } catch (error) {
    updateSetupLastMessage(error instanceof Error ? error.message : 'Could not create the workspace.', true)
  } finally {
    creatingRestaurant.value = false
  }
}

function updateSetupLastMessage(content: string, error: boolean) {
  const last = messages.value[messages.value.length - 1]
  if (!last) return
  messages.value = [
    ...messages.value.slice(0, -1),
    { ...last, content, error, streaming: false },
  ]
}

// --- drag-drop ---

const onDragEnter = () => { dragCounter.value++ }
const onDragLeave = () => { dragCounter.value = Math.max(0, dragCounter.value - 1) }
const onDrop = (e: DragEvent) => {
  dragCounter.value = 0
  if (!siteId.value || setupMode.value || isDepleted.value) return
  const file = e.dataTransfer?.files[0]
  if (file) stageFile(file)
}

const handleFileInput = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) stageFile(file)
  if (fileInputRef.value) fileInputRef.value.value = ''
}

const stageFile = (file: File) => {
  const isText = file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')
  const allowedMedia = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']

  if (!isText && !allowedMedia.includes(file.type.toLowerCase())) {
    messages.value = [...messages.value, {
      role: 'assistant',
      content: `Unsupported file type (${file.type}). Please attach a JPEG, PNG, WEBP, GIF, PDF, or TXT.`,
      error: true,
    }]
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    messages.value = [...messages.value, {
      role: 'assistant',
      content: `**${file.name}** is ${mb} MB — too large. Please compress below 10 MB or send page photos instead.`,
      error: true,
    }]
    return
  }

  if (isText) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = (e.target?.result as string | null)?.trim() ?? ''
      if (!content) return
      pendingText.value = { name: file.name, content }
    }
    reader.onerror = (e) => {
      console.error('[ChowBot] FileReader error:', e)
      messages.value = [...messages.value, {
        role: 'assistant',
        content: `Failed to read **${file.name}**. The file may be corrupted or inaccessible.`,
        error: true,
      }]
    }
    reader.readAsText(file)
    return
  }

  pendingFile.value = file
}

const processFile = async (file: File, caption = '') => {
  if (!siteId.value) return

  const label = caption ? `📎 ${file.name} — ${caption}` : `📎 ${file.name}`
  messages.value = [...messages.value, { role: 'user', content: label }]
  isUploading.value = true

  try {
    const formData = new FormData()
    formData.append('file', file)
    if (caption) formData.append('menuName', caption)

    let json: ApiValue = null
    let httpOk = false
    let httpStatus = 0
    try {
      const raw = await fetch(`/api/ai/${siteId.value}/menu/extract`, { method: 'POST', body: formData })
      httpOk = raw.ok
      httpStatus = raw.status
      json = await raw.json().catch(() => null)
    } catch (networkErr) {
      // Connection dropped (e.g. server crash) — make the error visible
      console.error('[ChowBot] menu extract network error:', networkErr)
      throw new Error('Connection lost during upload. Please try again.')
    }

    if (!httpOk) {
      const tip = json?.error ?? `Upload failed (${httpStatus}). Please try again.`
      console.error('[ChowBot] menu extract server error:', httpStatus, json)
      throw new Error(tip)
    }

    const res: { success: boolean; menuId: string; menuItems: ApiRecord[]; warning: string | null } = json

    const count = res.menuItems?.length ?? 0
    const msg = count > 0
      ? `Extracted **${count} menu item${count === 1 ? '' : 's'}** and added to your menu.${res.warning ? `\n\n⚠️ ${res.warning}` : ''}`
      : `No items found in that file.${res.warning ? ` ${res.warning}` : ''} Try a higher-resolution photo.`

    messages.value = [...messages.value, { role: 'assistant', content: msg }]
    if (count > 0) {
      const { paths } = useDashboardSiteLinks(siteId.value)
      await navigateTo(paths.value.menu)
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error('[ChowBot] processFile failed:', error.message)
    messages.value = [...messages.value, {
      role: 'assistant',
      content: error.message || 'Menu extraction failed. Please try again.',
      error: true,
    }]
  } finally {
    isUploading.value = false
  }
}

// --- tool labels ---

const toolLabel = (name: string): string => {
  const labels: Record<string, string> = {
    get_posts: 'Fetching posts…',
    create_post: 'Creating post…',
    publish_post: 'Publishing post…',
    get_menu: 'Loading menu…',
    get_site_stats: 'Checking stats…',
    rename_site: 'Renaming site…',
    get_locations: 'Fetching locations…',
    create_location: 'Creating location…',
    update_location: 'Updating location…',
    add_menu_item: 'Adding menu item…',
    add_menu_items_batch: 'Adding menu items…',
    sync_menu_items: 'Updating menu items…',
    update_menu_item: 'Updating menu item…',
    delete_menu_item: 'Deleting menu item…',
    delete_menu_section: 'Deleting menu section…',
    publish_menu: 'Publishing menu…',
    delete_menu: 'Deleting menu…',
    create_menu: 'Creating menu…',
    rename_menu: 'Renaming menu…',
    set_default_currency: 'Updating currency…',
    rename_menu_section: 'Renaming menu section…',
    get_reviews: 'Fetching reviews…',
    reply_to_review: 'Saving reply…',
    get_location_media: 'Fetching media…',
    delete_media_asset: 'Deleting media…',
    generate_image: 'Generating image with AI…',
    get_location_qa: 'Fetching Q&A…',
    add_qa: 'Adding Q&A…',
    delete_qa: 'Deleting Q&A…',
    get_contact_submissions: 'Fetching contacts…',
    get_reservation_submissions: 'Fetching reservations…',
  }
  return labels[name] ?? name
}

// --- markdown ---

function renderMarkdown(text: string): string {
  const html = text
    .replace(/```[\s\S]*?```/g, m => `<pre><code>${m.slice(3, -3).replace(/^[^\n]*\n/, '')}</code></pre>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^[-*] (.+)/gm, '<li>$1</li>')
    .replace(/(<li>.*?<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(.+)$/, '<p>$1</p>')
  
  if (import.meta.server) return html
  return DOMPurify.sanitize(html)
}
</script>

<style scoped>
.chowbot-overlay-enter-active,
.chowbot-overlay-leave-active {
  transition: opacity 0.2s ease;
}
.chowbot-overlay-enter-from,
.chowbot-overlay-leave-to {
  opacity: 0;
}

.chowbot-panel-enter-active,
.chowbot-panel-leave-active {
  overflow: hidden;
  transition: width 0.25s ease, transform 0.25s ease, opacity 0.2s ease;
}
.chowbot-panel-enter-to,
.chowbot-panel-leave-from {
  width: 24rem;
}
.chowbot-panel-enter-from,
.chowbot-panel-leave-to {
  width: 0;
  opacity: 0;
  transform: translateX(100%);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
