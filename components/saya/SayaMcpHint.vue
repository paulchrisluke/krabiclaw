<template>
  <button
    v-if="editMode && hint"
    type="button"
    class="mt-6 inline-flex items-center gap-2 rounded-full border border-dashed border-default px-4 py-2 text-xs text-muted transition hover:border-muted hover:text-default"
    @click="trigger"
  >
    <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193q-.51.041-1.02.072v3.091l-3-3q-2.031 0-4.02-.163a2.1 2.1 0 0 1-.825-.242m9.345-8.334a2 2 0 0 0-.476-.095a48.6 48.6 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.5 48.5 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402c-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235q.865.113 1.74.194V21l4.155-4.155"/></svg>
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
