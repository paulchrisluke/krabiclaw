<template>
  <!-- Analytics is on by default. On a first visit (no Zaraz consent cookie)
       this grants the Google Analytics purpose, releases the pageview Zaraz
       queued while it waited, and shows a one-line notice whose only choice is
       Reject. Closing or ignoring it leaves analytics on. The answer lives in
       Zaraz's own cookie, so a returning visitor is not asked again; the
       Cookie preferences link reopens Zaraz's modal to change it. -->
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
        <button type="button" class="cursor-pointer rounded border border-current px-4 py-1.5 font-medium hover:opacity-80" @click="reject">
          {{ t('legal.reject') }}
        </button>
        <button type="button" class="cursor-pointer px-2 text-lg leading-none opacity-70 hover:opacity-100" :aria-label="t('legal.dismiss')" @click="visible = false">
          ×
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

// Cloudflare's documented implicit-consent pattern: when the consent cookie
// is absent, setAll(true) then sendQueuedEvents().
function grantByDefault() {
  const consent = window.zaraz?.consent
  if (!consent?.APIReady) return
  const answered = document.cookie.split('; ').some(cookie => cookie.startsWith(`${ZARAZ_CONSENT_COOKIE_NAME}=`))
  if (answered) return
  consent.setAll(true)
  consent.sendQueuedEvents()
  visible.value = true
}

function reject() {
  window.zaraz?.consent?.set({ [ZARAZ_ANALYTICS_PURPOSE_ID]: false })
  visible.value = false
}

onMounted(() => {
  document.addEventListener('zarazConsentAPIReady', grantByDefault)
  grantByDefault()
})
onBeforeUnmount(() => document.removeEventListener('zarazConsentAPIReady', grantByDefault))
</script>
