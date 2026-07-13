<template>
  <div class="flex items-center gap-2" aria-label="Share article">
    <button type="button" class="flex size-10 items-center justify-center rounded-lg border border-gray-200 text-[var(--blawby-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blawby-primary)]" title="Share article" @click="share">
      <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
    </button>
    <span v-if="status" role="status" class="text-sm text-slate-600">{{ status }}</span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ title: string; url: string }>()
const status = ref('')

async function share() {
  try {
    if (navigator.share) {
      await navigator.share({ title: props.title, url: props.url })
      status.value = 'Shared'
    } else {
      await navigator.clipboard.writeText(props.url)
      status.value = 'Link copied'
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') status.value = 'Unable to share'
  }
}
</script>
