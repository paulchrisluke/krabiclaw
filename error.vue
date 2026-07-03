<template>
  <div class="min-h-screen flex items-center justify-center bg-default px-6 py-12">
    <div class="w-full max-w-sm text-center">
      <img src="/krabi-claw-logo.png" alt="KrabiClaw Logo" class="h-8 mb-6 mx-auto">

      <p class="text-sm font-medium text-dimmed uppercase tracking-[0.18em] mb-2">
        Error {{ error.statusCode }}
      </p>
      <h1 class="text-2xl font-bold text-default tracking-tight mb-2">
        {{ isNotFound ? "Page not found" : "Something went wrong" }}
      </h1>
      <p class="text-sm text-muted mb-8">
        {{ isNotFound
          ? "The page you're looking for doesn't exist or may have moved."
          : "We hit an unexpected error. Please try again." }}
      </p>

      <PlatformButton size="lg" class="rounded-full" @click="clearError({ redirect: '/' })">
        Go back home
      </PlatformButton>

      <div v-if="isDev" class="mt-8 text-left rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-mono text-red-700 whitespace-pre-wrap">
        <p>Message: {{ error.message }}</p>
        <p v-if="error.stack" class="mt-2">Stack: {{ error.stack }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  error: Object
})

const isDev = import.meta.dev
const isNotFound = computed(() => props.error?.statusCode === 404)
</script>
