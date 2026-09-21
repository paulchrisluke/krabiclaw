<template>
  <UButton
    icon="i-lucide-arrow-left"
    aria-label="Back"
    color="neutral"
    variant="ghost"
    size="sm"
    square
    class="min-w-0 shrink-0"
    data-testid="dashboard-navbar-back"
    @click="back"
  />
</template>

<script setup lang="ts">
// Back is the browser's back. Only a tab with nothing behind it, opened
// straight onto a deep link, goes to the dashboard root instead, which routes
// to Today. The browser's history length is the test, not the router's own
// record of the previous entry: a reload or a redirect keeps the former and
// clears the latter.
const router = useRouter()

function back() {
  if (import.meta.client && window.history.length > 1) return router.back()
  return navigateTo('/dashboard')
}
</script>
