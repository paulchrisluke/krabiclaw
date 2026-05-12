<template>
  <header class="sticky top-0 z-50 bg-(--ui-bg)/85 backdrop-blur-md border-b border-(--ui-border)">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6 h-16">

      <!-- Wordmark -->
      <NuxtLink to="/" class="flex items-center gap-2.5 shrink-0 group">
        <img src="/krabi-claw-logo.png" alt="KrabiClaw" class="w-8.5 h-8.5 rounded-[9px] group-hover:rotate-12 transition-transform duration-200" />
        <span class="kc-wordmark text-[19px]">
          <span class="kc-wordmark__krabi">krabi</span><span class="kc-wordmark__claw">claw</span><span class="kc-wordmark__tld">.com</span>
        </span>
      </NuxtLink>

      <!-- Pill nav (desktop) -->
      <nav class="hidden md:flex items-center gap-1 bg-(--ui-bg-elevated)/50 border border-(--ui-border-muted) rounded-full px-1 py-1">
        <NuxtLink
          v-for="item in navItems"
          :key="item.label"
          :to="item.to"
          class="px-4 py-2 rounded-full text-[13.5px] font-medium text-(--ui-text-muted) transition-colors hover:text-(--ui-text) no-underline"
          :class="$route.fullPath === item.to || ($route.fullPath.startsWith(item.to) && item.to !== '/') ? 'bg-(--ui-bg-elevated) text-(--ui-text) shadow-[0_1px_2px_rgba(31,37,71,0.06)]' : ''"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <!-- Right actions -->
      <div class="flex items-center gap-2 shrink-0">
        <UColorModeButton variant="ghost" color="neutral" size="sm" />
        <NuxtLink to="/login" class="hidden sm:block text-[13.5px] font-medium text-(--ui-text) px-3 py-2 hover:text-(--ui-text-muted) transition-colors no-underline">
          Login
        </NuxtLink>
        <NuxtLink
          to="/signup"
          class="hidden sm:inline-flex items-center gap-1.5 bg-(--ui-primary) text-(--ui-text-inverted) text-[13.5px] font-semibold px-4 py-2.5 rounded-[9px] hover:bg-(--ui-primary)/90 transition-colors no-underline"
        >
          Start free
          <UIcon name="i-heroicons-arrow-right" class="size-3.5" />
        </NuxtLink>
        <UButton
          icon="i-heroicons-bars-3"
          variant="ghost"
          color="neutral"
          size="sm"
          class="md:hidden"
          aria-label="Toggle menu"
          @click="toggleMobileMenu"
        />
      </div>
    </div>

    <!-- Mobile menu -->
    <div v-if="isMobileMenuOpen" class="md:hidden border-t border-(--ui-border) bg-(--ui-bg)">
      <nav class="px-4 py-4 space-y-2">
        <NuxtLink
          v-for="item in navItems"
          :key="item.label"
          :to="item.to"
          class="block px-4 py-3 rounded-lg text-[13.5px] font-medium text-(--ui-text-muted) hover:text-(--ui-text) hover:bg-(--ui-bg-muted) transition-colors no-underline"
          :class="$route.fullPath === item.to || ($route.fullPath.startsWith(item.to) && item.to !== '/') ? 'bg-(--ui-bg-muted) text-(--ui-text)' : ''"
          @click="closeMobileMenu"
        >
          {{ item.label }}
        </NuxtLink>
        <div class="pt-4 space-y-2">
          <NuxtLink to="/login" class="block px-4 py-3 text-[13.5px] font-medium text-(--ui-text) hover:text-(--ui-text-muted) transition-colors no-underline" @click="closeMobileMenu">
            Login
          </NuxtLink>
          <NuxtLink to="/signup" class="block px-4 py-3 text-[13.5px] font-semibold text-(--ui-primary) transition-colors no-underline" @click="closeMobileMenu">
            Start free
          </NuxtLink>
        </div>
      </nav>
    </div>
  </header>
</template>

<script setup>
const navItems = [
  { label: 'Features', to: '/#features' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Templates', to: '/templates' },
  { label: 'Docs', to: '/docs' },
]

const isMobileMenuOpen = ref(false)

function toggleMobileMenu() {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}

function closeMobileMenu() {
  isMobileMenuOpen.value = false
}

watch(() => useRoute().fullPath, () => {
  closeMobileMenu()
})
</script>
