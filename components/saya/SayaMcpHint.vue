<template>
  <button
    v-if="editMode && hint"
    type="button"
    class="mt-6 inline-flex items-center gap-2 rounded-full border border-dashed border-default px-4 py-2 text-xs text-muted transition hover:border-muted hover:text-default"
    @click="trigger"
  >
    <UIcon name="i-heroicons-chat-bubble-left-right" class="size-4" />
    Try: "{{ hint }}"
  </button>
</template>

<script setup lang="ts">
const props = defineProps<{ hint: string | null }>()

const { editMode } = useEditMode()
const { open, setDraftMessage } = useChowBot()

const trigger = () => {
  if (!props.hint) return
  setDraftMessage(props.hint)
  open()
}
</script>
