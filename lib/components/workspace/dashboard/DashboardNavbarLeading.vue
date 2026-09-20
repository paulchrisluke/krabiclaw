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
// Back is the browser's back. A tab opened straight onto a deep link has no
// previous entry, so it goes to the dashboard root, which routes to Today.
const router = useRouter()

function back() {
  if (import.meta.client && window.history.state?.back) return router.back()
  return navigateTo('/dashboard')
}
</script>
