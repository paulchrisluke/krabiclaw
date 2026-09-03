<template>
  <USlideover
    :open="open"
    :title="title"
    side="right"
    modal
    :dismissible="!saving"
    :content="{ onOpenAutoFocus: focusEditor }"
    class="w-full max-w-lg"
    :ui="{ content: 'bg-default', body: 'flex min-h-0 flex-1 flex-col', footer: 'border-t border-default' }"
    @update:open="handleOpen"
    @after:leave="emit('restore-focus')"
  >
    <template #body>
      <div ref="editorBody" class="min-h-0 flex-1 overflow-y-auto py-2" @keydown.ctrl.enter="requestSave" @keydown.meta.enter="requestSave">
        <slot />
      </div>
    </template>

    <template #footer>
      <div class="w-full pb-[env(safe-area-inset-bottom)]">
        <UAlert v-if="error" class="mb-4" color="error" variant="soft" title="Could not save" :description="error" />
        <div class="flex items-center justify-end gap-3">
          <UButton color="neutral" variant="ghost" label="Cancel" :disabled="saving" @click="emit('cancel')" />
          <UButton label="Save" :loading="saving" :disabled="saveDisabled || saving" @click="emit('save')" />
        </div>
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  saving?: boolean
  saveDisabled?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  close: []
  cancel: []
  save: []
  'restore-focus': []
}>()

const editorBody = ref<HTMLElement | null>(null)

function handleOpen(open: boolean) {
  if (!open) emit('close')
}

function requestSave() {
  if (!props.saving && !props.saveDisabled) emit('save')
}

function focusEditor(event: Event) {
  event.preventDefault()
  editorBody.value?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]')?.focus()
}
</script>
