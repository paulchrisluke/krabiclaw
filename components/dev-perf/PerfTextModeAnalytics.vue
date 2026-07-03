<template>
  <section class="dev-perf-section" aria-label="Analytics composable render test">
    <h2>Analytics composable render test</h2>
    <p>
      This mode calls <code>useAnalytics()</code> and <code>getGaClientId()</code>
      on the page, to isolate whether wiring in the analytics composable adds
      any SSR cost. Note: the GA4 <code>&lt;script&gt;</code> tag itself is injected
      globally by <code>app.vue</code> on every page (including the
      <code>text</code> baseline), so this mode only isolates the
      composable call, not the script tag.
    </p>
    <p>GA client id (client-only, expect null during SSR): {{ gaClientId }}</p>
  </section>
</template>

<script setup lang="ts">
import { getGaClientId, useAnalytics } from '~/composables/useAnalytics'

const runtimeConfig = useRuntimeConfig()
const analytics = useAnalytics()
const gaClientId = ref<string | null>(null)

onMounted(() => {
  gaClientId.value = getGaClientId()
  // Only fire synthetic GA4 event on private perf pages, not public /dev/perf-text
  // where GA4 is already initialized by app.vue
  if (!runtimeConfig.public.perfPublicTestPage) {
    analytics.trackEvent('dashboard_visited')
  }
})
</script>
