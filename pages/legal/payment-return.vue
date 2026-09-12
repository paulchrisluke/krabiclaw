<!--
  Non-mutating Payment Link return page (plan step 5 / R26): a first-use
  Payment Link redirects HERE with Blawby-supplied identifiers in the
  query string. This page's GET rendering does NO lookup and NO
  attachment -- it performs no D1 read of legal_intake_references and
  never calls the post-pay route during SSR/initial render (proof: no
  useAsyncData/useFetch/server-side call anywhere in this file; the ONLY
  network call this page makes is the client-side $fetch inside
  onMounted, which never runs during SSR). Only that client-side POST
  (submitted after hydration, same-origin, to
  /api/public/sites/[siteId]/legal/intakes/post-pay) may verify and
  attach the session, per server/api/public/sites/[siteId]/legal/intakes/
  post-pay.post.ts's own header comment.
-->
<template>
  <main class="platform-theme min-h-screen bg-default px-5 py-12 text-default flex items-center justify-center">
    <div class="mx-auto max-w-md w-full space-y-6 text-center">
      <h1 class="text-2xl font-semibold text-highlighted">Confirming your payment</h1>
      <USkeleton v-if="pending" class="h-24 w-full" />
      <UAlert
        v-else-if="error"
        color="error"
        title="We couldn't confirm your payment"
        :description="error"
      />
      <UAlert
        v-else-if="confirmed"
        color="success"
        title="Payment confirmed"
        description="Your intake has been submitted. You may close this page."
      />
    </div>
  </main>
</template>

<script setup lang="ts">
import { $fetch } from 'ofetch'
import { clearLegalIntakeRequestKey, peekLegalIntakeRequestKey } from '~/composables/useLegalIntakeRequest'

definePageMeta({ layout: false })
useSeoMeta({ title: 'Confirming payment', robots: 'noindex, nofollow', referrer: 'no-referrer' })

const { siteId } = useTenantSite()
const route = useRoute()

const pending = ref(true)
const confirmed = ref(false)
const error = ref('')

// Deliberately NOT useAsyncData/useFetch (both can execute during SSR) --
// onMounted only ever runs client-side, after hydration, which is the
// structural guarantee that GET rendering itself performs no lookup or
// attachment.
onMounted(async () => {
  try {
    if (!siteId) throw new Error('This page is only valid on a site with legal intake enabled.')

    // Query param names are PLACEHOLDERS -- Blawby's real Payment Link
    // redirect query-string contract is not yet confirmed against U8; see
    // the U6 report.
    const blawbyIntakeId = typeof route.query.intake_id === 'string' ? route.query.intake_id : ''
    const checkoutSessionId = typeof route.query.checkout_session_id === 'string' ? route.query.checkout_session_id : ''
    const requestReference = peekLegalIntakeRequestKey(siteId)

    if (!blawbyIntakeId || !checkoutSessionId || !requestReference) {
      throw new Error('This payment confirmation link is missing required information.')
    }

    await $fetch(`/api/public/sites/${encodeURIComponent(siteId)}/legal/intakes/post-pay`, {
      method: 'POST',
      body: { requestReference, blawbyIntakeId, checkoutSessionId },
    })
    // R14: this is the terminal (success) outcome for this site's retained
    // request reference -- clear it so a later intake on the same site
    // starts a fresh reference instead of reusing this now-completed one
    // (which the create route would otherwise reject as
    // LEGAL_INTAKE_PAYLOAD_CONFLICT).
    clearLegalIntakeRequestKey(siteId)
    confirmed.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Your payment could not be confirmed. Please contact support.'
  } finally {
    pending.value = false
  }
})
</script>
