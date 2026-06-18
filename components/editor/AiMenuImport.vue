<template>
  <UModal v-model:open="isOpen" :title="modalTitle" :ui="{ content: 'max-w-2xl' }">
    <!-- Trigger slot -->
    <template #default>
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-heroicons-sparkles"
        @click="isOpen = true"
      >
        Import from photo
      </UButton>
    </template>

    <!-- Modal body -->
    <template #body>
      <!-- Step: upload -->
      <div v-if="step === 'idle'" class="space-y-4">
        <!-- Drop zone -->
        <div
          class="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 transition-colors"
          :class="isDragging
            ? 'border-primary bg-primary/5'
            : 'border-default hover:border-accented'"
          @dragenter.prevent="isDragging = true"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="onDrop"
          @click="fileInput?.click()"
        >
          <UIcon name="i-heroicons-photo" class="size-10 text-muted" />
          <div class="text-center">
            <p class="text-sm font-medium text-highlighted">
              {{ selectedFile ? selectedFile.name : 'Drop a menu photo here' }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ selectedFile
                ? formatFileSize(selectedFile.size)
                : 'JPEG, PNG, WEBP or PDF — max 10 MB.' }}
            </p>
          </div>
          <UButton v-if="!selectedFile" size="sm" color="neutral" variant="outline" @click.stop="fileInput?.click()">
            Choose file
          </UButton>
          <div v-else class="flex gap-2">
            <UButton size="sm" color="neutral" variant="outline" @click.stop="fileInput?.click()">
              Change
            </UButton>
            <UButton size="sm" color="neutral" variant="ghost" icon="i-heroicons-x-mark" @click.stop="selectedFile = null" />
          </div>
          <input
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            class="hidden"
            @change="onFileSelect"
          />
        </div>

        <UAlert
          v-if="uploadError"
          color="error"
          variant="soft"
          :description="uploadError"
          icon="i-heroicons-exclamation-triangle"
        />

        <!-- Credit info -->
        <div class="flex items-center gap-2 rounded-lg border border-default bg-elevated px-3 py-2">
          <UIcon name="i-heroicons-bolt" class="size-4 shrink-0 text-muted" />
          <p class="text-xs text-muted">
            Each extraction uses ~10–50 credits depending on menu size.
            <span v-if="credits !== null"> You have <strong class="text-default">{{ credits.toLocaleString() }}</strong> credits remaining.</span>
          </p>
        </div>
      </div>

      <!-- Step: extracting -->
      <div v-else-if="step === 'extracting'" class="space-y-3 py-4">
        <div class="flex items-center gap-3">
          <div class="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p class="text-sm text-highlighted">Reading menu with AI…</p>
        </div>
        <div class="space-y-2">
          <USkeleton v-for="i in 4" :key="i" class="h-10 w-full rounded" />
        </div>
        <p class="text-xs text-muted">This usually takes 5–15 seconds.</p>
      </div>

      <!-- Step: preview extracted items -->
      <div v-else-if="step === 'preview'" class="space-y-4">
        <UAlert
          v-if="extractWarning"
          color="warning"
          variant="soft"
          :description="extractWarning"
          icon="i-heroicons-exclamation-triangle"
        />

        <p class="text-sm text-muted">
          {{ editedItems.length }} item{{ editedItems.length === 1 ? '' : 's' }} found. Edit before saving — nothing is published yet.
        </p>

        <div class="max-h-96 overflow-y-auto rounded-lg border border-default">
          <div
            v-for="(item, idx) in editedItems"
            :key="idx"
            class="border-b border-default last:border-0"
          >
            <!-- Collapsed row -->
            <div
              v-if="expandedIdx !== idx"
              class="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-elevated"
              @click="expandedIdx = idx"
            >
              <div class="min-w-0 flex-1">
                <span class="text-sm font-medium text-highlighted">{{ item.name || '(unnamed)' }}</span>
                <span v-if="item.section" class="ml-2 text-xs text-muted">{{ item.section }}</span>
              </div>
              <span v-if="item.price_amount" class="shrink-0 text-sm text-default">{{ item.price_amount }}</span>
              <UButton size="xs" color="neutral" variant="ghost" icon="i-heroicons-trash" @click.stop="editedItems.splice(idx, 1)" />
            </div>

            <!-- Expanded inline edit -->
            <div v-else class="bg-elevated px-4 py-3">
              <div class="space-y-2">
                <div class="grid gap-2 sm:grid-cols-2">
                  <UFormField label="Name" size="sm">
                    <UInput v-model="item.name" size="sm" placeholder="Dish name" autofocus />
                  </UFormField>
                  <UFormField label="Price" size="sm">
                    <UInput v-model="item.price_amount" size="sm" placeholder="250" />
                  </UFormField>
                </div>
                <UFormField label="Section" size="sm">
                  <UInput v-model="item.section" size="sm" placeholder="Mains" />
                </UFormField>
                <UFormField label="Description" size="sm">
                  <UTextarea v-model="item.description" size="sm" :rows="2" placeholder="Optional description..." />
                </UFormField>
                <div class="flex justify-end">
                  <UButton size="xs" color="neutral" variant="ghost" @click="expandedIdx = null">Done</UButton>
                </div>
              </div>
            </div>
          </div>

          <div v-if="editedItems.length === 0" class="px-4 py-8 text-center text-sm text-muted">
            No items extracted. Try a clearer photo.
          </div>
        </div>

        <!-- Credits charged -->
        <div v-if="creditsCharged" class="flex items-center gap-2 rounded-lg border border-default bg-elevated px-3 py-2">
          <UIcon name="i-heroicons-bolt" class="size-4 shrink-0 text-muted" />
          <p class="text-xs text-muted">
            Used <strong class="text-default">{{ creditsCharged }}</strong> credits.
            <span v-if="creditsRemaining !== null"> {{ creditsRemaining.toLocaleString() }} remaining.</span>
          </p>
        </div>
      </div>

      <!-- Step: done -->
      <div v-else-if="step === 'done'" class="py-6 text-center">
        <UIcon name="i-heroicons-check-circle" class="mx-auto size-10 text-green-500" />
        <p class="mt-3 text-sm font-medium text-highlighted">
          {{ savedCount }} item{{ savedCount === 1 ? '' : 's' }} added to menu
        </p>
        <p class="mt-1 text-xs text-muted">Items are live on your menu immediately.</p>
      </div>
    </template>

    <template #footer>
      <!-- idle -->
      <div v-if="step === 'idle'" class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" @click="isOpen = false">Cancel</UButton>
        <UButton
          icon="i-heroicons-sparkles"
          :disabled="!selectedFile"
          @click="runExtraction"
        >
          Extract items
        </UButton>
      </div>

      <!-- preview -->
      <div v-else-if="step === 'preview'" class="flex items-center justify-between gap-2">
        <UButton color="neutral" variant="ghost" size="sm" icon="i-heroicons-arrow-left" @click="step = 'idle'">
          Try another photo
        </UButton>
        <div class="flex gap-2">
          <UButton color="neutral" variant="ghost" @click="isOpen = false">Discard</UButton>
          <UButton
            :loading="saving"
            :disabled="editedItems.length === 0"
            @click="saveItems"
          >
            Add {{ editedItems.length }} item{{ editedItems.length === 1 ? '' : 's' }} to menu
          </UButton>
        </div>
      </div>

      <!-- done -->
      <div v-else-if="step === 'done'" class="flex justify-end">
        <UButton @click="isOpen = false">Close</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { useToast } from '~/composables/useToast'

const props = defineProps<{
  siteId: string
  menuId?: string | null
}>()

const emit = defineEmits<{
  imported: [menuId: string]
}>()

const toast = useToast()

type Step = 'idle' | 'extracting' | 'preview' | 'done'

const isOpen = ref(false)
const step = ref<Step>('idle')
const isDragging = ref(false)
const selectedFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const uploadError = ref<string | null>(null)
const extractWarning = ref<string | null>(null)
const editedItems = ref<{ section: string; name: string; description: string; price_amount: string }[]>([])
const expandedIdx = ref<number | null>(null)
const saving = ref(false)
const savedCount = ref(0)
const creditsCharged = ref<number | null>(null)
const creditsRemaining = ref<number | null>(null)
const resultMenuId = ref<string | null>(null)
const credits = computed(() => creditsRemaining.value)

const modalTitle = computed(() => {
  if (step.value === 'extracting') return 'Reading menu…'
  if (step.value === 'preview') return 'Review extracted items'
  if (step.value === 'done') return 'Import complete'
  return 'Import menu from photo'
})

watch(isOpen, (open: boolean) => {
  if (!open) reset()
})

function reset() {
  step.value = 'idle'
  selectedFile.value = null
  uploadError.value = null
  extractWarning.value = null
  editedItems.value = []
  expandedIdx.value = null
  saving.value = false
  creditsCharged.value = null
  creditsRemaining.value = null
  resultMenuId.value = null
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files[0]
  if (file) setFile(file)
}

function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) setFile(file)
}

function setFile(file: File) {
  uploadError.value = null
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
  if (!allowed.includes(file.type.toLowerCase())) {
    uploadError.value = 'Please upload a JPEG, PNG, WEBP, GIF, or PDF file.'
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    uploadError.value = 'File must be under 10 MB.'
    return
  }
  selectedFile.value = file
}

async function runExtraction() {
  if (!selectedFile.value) return
  step.value = 'extracting'
  uploadError.value = null

  const fd = new FormData()
  fd.append('file', selectedFile.value)
  if (props.menuId) fd.append('menuId', props.menuId)

  try {
    const res = await $fetch<{
      success: boolean
      menuId: string
      menuItems: ApiRecord[]
      warning?: string | null
      credits: { charged: number; remaining: number }
      error?: string
    }>(`/api/dashboard/ai/menu/extract`, { method: 'POST', body: fd })

    resultMenuId.value = res.menuId
    creditsCharged.value = res.credits?.charged ?? null
    creditsRemaining.value = res.credits?.remaining ?? null
    extractWarning.value = res.warning ?? null

    editedItems.value = (res.menuItems ?? []).map((item: ApiValue) => ({
      section: item.section ?? '',
      name: item.name ?? '',
      description: item.description ?? '',
      price_amount: item.price_amount ?? '',
    }))

    step.value = 'preview'
  } catch (err) {
    const msg = err instanceof Error ? err.message : (err && typeof err === 'object' && 'data' in err && typeof err.data === 'object' && err.data && 'error' in err.data && typeof err.data.error === 'string') ? err.data.error : 'Extraction failed. Please try again.'
    uploadError.value = msg
    step.value = 'idle'
    toast.addToast(msg, 'error')
  }
}

async function saveItems() {
  if (!resultMenuId.value) return
  saving.value = true
  try {
    savedCount.value = editedItems.value.length
    step.value = 'done'
    emit('imported', resultMenuId.value)
    toast.addToast(`${savedCount.value} item${savedCount.value === 1 ? '' : 's'} added to menu`, 'success')
  } finally {
    saving.value = false
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>
