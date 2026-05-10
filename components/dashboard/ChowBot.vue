<template>
  <Transition name="chowbot-overlay">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-40 bg-black/20"
      @click="close"
    />
  </Transition>

  <Transition name="chowbot-panel">
    <div
      v-if="isOpen"
      class="fixed right-0 top-0 bottom-0 z-50 flex w-96 flex-col border-l border-default bg-default shadow-xl"
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
          <div class="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-primary px-8 py-10">
            <UIcon name="i-heroicons-arrow-up-tray" class="size-10 text-primary" />
            <p class="font-medium">Drop menu image or PDF</p>
            <p class="text-xs text-muted">JPEG, PNG, WEBP or PDF — max 10 MB</p>
          </div>
        </div>
      </Transition>

      <div class="flex shrink-0 items-center justify-between border-b border-default px-4 py-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-bot" class="size-4 text-primary" />
          <span class="text-sm font-semibold">ChowBot</span>
        </div>
        <div class="flex items-center gap-1">
          <UTooltip text="New conversation">
            <UButton
              icon="i-heroicons-plus"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="!messages.length"
              @click="clearMessages"
            />
          </UTooltip>
          <UButton
            icon="i-heroicons-x-mark"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="close"
          />
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto">
        <UChatMessages :status="isLoading || isUploading ? 'submitted' : undefined">
          <div
            v-if="messages.length === 0"
            class="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center"
          >
            <UIcon name="i-lucide-bot" class="size-8 text-primary opacity-60" />
            <p class="text-sm font-medium">What can I help with?</p>
            <p class="text-xs text-muted">Ask anything, or drop a menu image to extract it.</p>
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
            <template v-if="msg.toolCalls?.length || msg.role === 'assistant'" #content>
              <div v-if="msg.toolCalls?.length" class="mb-2 flex flex-col gap-1">
                <UChatTool
                  v-for="tool in msg.toolCalls"
                  :key="tool.name + i"
                  :text="toolLabel(tool.name)"
                />
              </div>
              <div
                v-if="msg.role === 'assistant'"
                class="prose prose-sm dark:prose-invert max-w-none"
                v-html="renderMarkdown(msg.content)"
              />
              <span v-else>{{ msg.content }}</span>
            </template>
          </UChatMessage>
        </UChatMessages>
      </div>

      <div class="shrink-0 border-t border-default p-3">
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
          :placeholder="pendingFile ? 'Add a caption (optional) then press send…' : 'Ask ChowBot anything…'"
          :disabled="isLoading || isUploading || !siteId"
          :loading="isLoading || isUploading"
          @submit="handleSubmit"
        />
        <div class="mt-2 flex items-center gap-2">
          <UTooltip text="Attach menu image or PDF">
            <UButton
              icon="i-heroicons-paper-clip"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="isLoading || isUploading || !siteId"
              @click="fileInputRef?.click()"
            />
          </UTooltip>
          <span v-if="isUploading" class="text-xs text-muted">Extracting menu…</span>
          <span v-else class="text-xs text-muted">or drag & drop a menu file anywhere</span>
        </div>
        <p v-if="!siteId" class="mt-2 text-center text-xs text-muted">
          Navigate to a site to use ChowBot.
        </p>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        class="hidden"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        @change="handleFileInput"
      />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useChowBot } from '~/composables/useChowBot'

const { isOpen, messages, isLoading, siteId, close, sendMessage, clearMessages } = useChowBot()

const input = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)
const pendingFile = ref<File | null>(null)
const isUploading = ref(false)
const dragCounter = ref(0)
const isDragging = computed(() => dragCounter.value > 0)

const starterPrompts = [
  'Show me my latest posts',
  "Write a post about today's special",
  "What's on our menu?",
  'Give me a site overview',
]

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

const handleStarter = (prompt: string) => {
  input.value = prompt
  handleSubmit()
}

// --- drag-drop ---

const onDragEnter = () => { dragCounter.value++ }
const onDragLeave = () => { dragCounter.value = Math.max(0, dragCounter.value - 1) }
const onDrop = (e: DragEvent) => {
  dragCounter.value = 0
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
  if (!allowed.includes(file.type.toLowerCase())) {
    messages.value = [...messages.value, {
      role: 'assistant',
      content: `Unsupported file type (${file.type}). Please attach a JPEG, PNG, WEBP, GIF, or PDF.`,
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

    let json: any = null
    let httpOk = false
    let httpStatus = 0
    try {
      const raw = await fetch(`/api/ai/${siteId.value}/menu/extract`, { method: 'POST', body: formData })
      httpOk = raw.ok
      httpStatus = raw.status
      json = await raw.json().catch(() => null)
    } catch (networkErr: any) {
      // Connection dropped (e.g. server crash) — make the error visible
      console.error('[ChowBot] menu extract network error:', networkErr)
      throw new Error('Connection lost during upload. Please try again.')
    }

    if (!httpOk) {
      const tip = json?.error ?? `Upload failed (${httpStatus}). Please try again.`
      console.error('[ChowBot] menu extract server error:', httpStatus, json)
      throw new Error(tip)
    }

    const res: { success: boolean; menuId: string; menuItems: any[]; warning: string | null } = json

    const count = res.menuItems?.length ?? 0
    const msg = count > 0
      ? `Extracted **${count} menu item${count === 1 ? '' : 's'}** saved as a draft.${res.warning ? `\n\n⚠️ ${res.warning}` : ''}\n\nGo to **Menu** in the sidebar to review and publish.`
      : `No items found in that file.${res.warning ? ` ${res.warning}` : ''} Try a higher-resolution photo.`

    messages.value = [...messages.value, { role: 'assistant', content: msg }]
  } catch (err: any) {
    console.error('[ChowBot] processFile failed:', err)
    messages.value = [...messages.value, {
      role: 'assistant',
      content: err?.message ?? 'Menu extraction failed. Please try again.',
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
    update_menu_item: 'Updating menu item…',
    publish_menu: 'Publishing menu…',
  }
  return labels[name] ?? name
}

// --- markdown ---

function renderMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, m => `<pre><code>${m.slice(3, -3).replace(/^[^\n]*\n/, '')}</code></pre>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^[-*] (.+)/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(.+)$/, '<p>$1</p>')
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
  transition: transform 0.25s ease;
}
.chowbot-panel-enter-from,
.chowbot-panel-leave-to {
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
