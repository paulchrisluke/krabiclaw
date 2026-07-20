<template>
  <UModal v-model:open="openModel" :title="title" :description="description">
    <template #body>
      <p v-if="body" class="text-sm text-muted">{{ body }}</p>
      <slot />
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          :label="cancelLabel"
          :disabled="loading"
          @click="handleCancel"
        />
        <UButton
          color="error"
          variant="solid"
          :label="confirmLabel"
          :loading="loading"
          @click="handleConfirm"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
interface DashboardConfirmDialogProps {
  title: string
  description?: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  loading?: boolean
}

withDefaults(defineProps<DashboardConfirmDialogProps>(), {
  description: undefined,
  body: undefined,
  confirmLabel: 'Delete',
  cancelLabel: 'Cancel',
  loading: false,
})

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const openModel = computed({
  get: () => open.value,
  set: (value: boolean) => { open.value = value },
})

function handleConfirm() {
  emit('confirm')
}

function handleCancel() {
  open.value = false
  emit('cancel')
}
</script>
