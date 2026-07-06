<template>
  <UModal :open="open" @update:open="emit('update:open', $event)">
    <template #content>
      <div class="p-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">Add a poster image</h2>
            <p class="mt-1 text-sm text-muted">Recommended.</p>
          </div>
          <UButton color="neutral" variant="ghost" icon="i-lucide-x" :disabled="uploading" @click="emit('update:open', false)" />
        </div>
        <p class="mt-4 text-sm text-muted">
          We can't auto-generate a video thumbnail, so without one this video may show blank while it loads.
          A screenshot of the video's first frame works great.
        </p>
        <p v-if="videoName" class="mt-3 truncate text-xs text-muted">Video: {{ videoName }}</p>
        <div class="mt-6 flex flex-wrap gap-2">
          <UButton icon="i-lucide-image" :loading="uploading" :disabled="uploading" @click="posterInput?.click()">
            Choose poster image
          </UButton>
          <UButton color="neutral" variant="soft" :disabled="uploading" @click="emit('submit', null)">
            Skip
          </UButton>
        </div>
        <input ref="posterInput" type="file" accept="image/*" class="hidden" @change="onPosterSelect" />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  open: boolean
  uploading?: boolean
  videoName?: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submit: [poster: File | null]
}>()

const posterInput = ref<HTMLInputElement | null>(null)

watch(() => props.open, (isOpen) => {
  if (!isOpen && posterInput.value) {
    posterInput.value.value = ''
  }
})

function onPosterSelect(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  if (!file) return
  emit('submit', file)
}
</script>
