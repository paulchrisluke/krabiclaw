<template>
  <header class="sticky top-0 z-50 bg-default/85 backdrop-blur-md border-b border-default">
    <div class="max-w-450 mx-auto px-4 sm:px-6 lg:px-10 flex items-center justify-between gap-4 h-16">
      <div class="flex items-center gap-2.5 min-w-0">
        <NuxtLink to="/" class="flex items-center gap-2.5 shrink-0 group no-underline">
          <img src="/krabi-claw-logo.png" alt="KrabiClaw" class="w-8.5 h-8.5 rounded-[9px] group-hover:rotate-12 transition-transform duration-200" />
          <span class="kc-wordmark text-[19px]">
            <span class="kc-wordmark__krabi">krabi</span><span class="kc-wordmark__claw">claw</span><span class="kc-wordmark__tld">{{ section === 'blog' ? 'blog' : 'docs' }}</span>
          </span>
        </NuxtLink>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-muted hover:text-default lg:hidden"
          :aria-label="section === 'blog' ? 'Browse blog' : 'Browse docs'"
          @click="emit('toggle-nav')"
        >
          <PlatformIcon name="menu" class="size-5" />
        </button>
        <template v-if="isAuthenticated">
          <PlatformButton to="/dashboard" size="sm">
            Dashboard
            <PlatformIcon name="arrow-right" class="size-3.5" />
          </PlatformButton>
        </template>
        <template v-else>
          <PlatformButton to="/login" variant="ghost" size="sm" class="hidden sm:inline-flex">
            Login
          </PlatformButton>
          <PlatformButton to="/signup" size="sm">
            Start free
            <PlatformIcon name="arrow-right" class="size-3.5" />
          </PlatformButton>
        </template>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  section: 'docs' | 'blog'
}>()

const emit = defineEmits<{
  'toggle-nav': []
}>()

const { isAuthenticated } = useAuth()
</script>
