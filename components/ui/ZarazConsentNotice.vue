<template>
  <!-- Zaraz holds the choice in its consent cookie. Until a visitor chooses,
       its Google Analytics purpose stays off and its events stay queued. -->
  <div
    v-if="visible"
    role="region"
    :aria-label="t('legal.analytics_notice_label')"
    class="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4"
  >
    <div class="relative flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl bg-elevated p-6 pr-14 text-sm text-default shadow-lg ring ring-default">
      <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" square class="absolute right-3 top-3" aria-label="Close and accept cookies" @click="choose(true)" />
      <p class="m-0 flex-1 basis-80 leading-6">
        {{ t('legal.analytics_notice') }}
        <a :href="privacyUrl" class="underline underline-offset-2">{{ t('legal.analytics_notice_link') }}</a>.
      </p>
      <div class="flex items-center gap-3">
        <UButton color="primary" class="px-6 py-3" @click="choose(true)">
          {{ t('legal.accept') }}
        </UButton>
        <UButton color="error" class="px-6 py-3" @click="choose(false)">
          {{ t('legal.reject') }}
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ZARAZ_ANALYTICS_PURPOSE_ID, ZARAZ_CONSENT_COOKIE_NAME } from '~/utils/zaraz-consent'

const { t } = useI18n()
const privacyUrl = new URL('/privacy', useRuntimeConfig().public.platformUrl).href
const visible = ref(false)

function showNotice() {
  const consent = window.zaraz?.consent
  if (!consent?.APIReady) return
  const answered = document.cookie.split('; ').some(cookie => cookie.startsWith(`${ZARAZ_CONSENT_COOKIE_NAME}=`))
  if (answered) return
  visible.value = true
}

function choose(accepted: boolean) {
  const consent = window.zaraz?.consent
  if (!consent?.APIReady) return
  consent.set({ [ZARAZ_ANALYTICS_PURPOSE_ID]: accepted })
  if (accepted) consent.sendQueuedEvents()
  visible.value = false
}

onMounted(() => {
  document.addEventListener('zarazConsentAPIReady', showNotice)
  showNotice()
})
onBeforeUnmount(() => document.removeEventListener('zarazConsentAPIReady', showNotice))
</script>
