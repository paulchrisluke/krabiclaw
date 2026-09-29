<template>
  <!-- Zaraz holds the choice in its consent cookie. Until a visitor chooses,
       its Google Analytics purpose stays off and its events stay queued. -->
  <div
    v-if="visible"
    role="region"
    :aria-label="t('legal.analytics_notice_label')"
    class="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4"
  >
    <div class="flex max-w-full flex-wrap items-center gap-x-6 gap-y-3 rounded-lg bg-inverted px-5 py-3 text-sm text-inverted shadow-lg">
      <p class="m-0">
        {{ t('legal.analytics_notice') }}
        <a :href="privacyUrl" class="underline underline-offset-2">{{ t('legal.analytics_notice_link') }}</a>.
      </p>
      <div class="flex items-center gap-x-3">
        <button type="button" class="cursor-pointer rounded border border-current px-4 py-1.5 font-medium hover:opacity-80" @click="accept">
          {{ t('legal.accept') }}
        </button>
        <button type="button" class="cursor-pointer rounded border border-current px-4 py-1.5 font-medium hover:opacity-80" @click="reject">
          {{ t('legal.reject') }}
        </button>
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

function accept() {
  const consent = window.zaraz?.consent
  if (!consent?.APIReady) return
  consent.set({ [ZARAZ_ANALYTICS_PURPOSE_ID]: true })
  consent.sendQueuedEvents()
  visible.value = false
}

function reject() {
  const consent = window.zaraz?.consent
  if (!consent?.APIReady) return
  consent.set({ [ZARAZ_ANALYTICS_PURPOSE_ID]: false })
  visible.value = false
}

onMounted(() => {
  document.addEventListener('zarazConsentAPIReady', showNotice)
  showNotice()
})
onBeforeUnmount(() => document.removeEventListener('zarazConsentAPIReady', showNotice))
</script>
