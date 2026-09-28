<template>
  <div class="relative">
    <button type="button" :class="buttonClass" @click="share">
      <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
      {{ t('social_posts.share') }}
    </button>
    <span v-if="status" role="status" class="absolute right-0 top-full z-10 mt-2 whitespace-nowrap rounded-lg border border-default bg-default px-3 py-2 text-xs text-muted shadow-lg">{{ status }}</span>
  </div>
</template>

<script setup lang="ts">
/** Shares the post's real address: the system share sheet, or the clipboard. */
const props = defineProps<{ title: string | null; buttonClass: string }>()
const { t } = useI18n()
const status = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
function flash(message: string) {
  status.value = message
  clearTimeout(timer)
  timer = setTimeout(() => { status.value = '' }, 2000)
}
async function share() {
  const url = window.location.href
  try {
    if (navigator.share) {
      await navigator.share({ title: props.title || undefined, url })
      return
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      flash(t('social_posts.link_copied'))
      return
    }
    flash(t('social_posts.share_unavailable'))
  } catch (error) {
    if ((error as Error).name !== 'AbortError') flash(t('social_posts.share_failed'))
  }
}
onUnmounted(() => clearTimeout(timer))
</script>
