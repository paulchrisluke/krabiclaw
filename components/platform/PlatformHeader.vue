<template>
  <header class="sticky top-0 z-50 bg-default/85 backdrop-blur-md border-b border-default">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6 h-16">

      <!-- Wordmark -->
      <NuxtLink to="/" class="flex items-center gap-2.5 shrink-0 group">
        <img src="/krabi-claw-logo.png" alt="KrabiClaw" class="w-8.5 h-8.5 rounded-[9px] group-hover:rotate-12 transition-transform duration-200" />
        <span class="kc-wordmark text-[19px]">
          <span class="kc-wordmark__krabi">krabi</span><span class="kc-wordmark__claw">claw</span><span class="kc-wordmark__tld">.com</span>
        </span>
      </NuxtLink>

      <!-- Pill nav (desktop) -->
      <nav class="hidden lg:flex items-center gap-1 bg-elevated/50 border border-muted rounded-full px-1 py-1">
        <NuxtLink
          v-for="item in navItems"
          :key="item.label"
          :to="item.to"
          class="px-4 py-2 rounded-full text-[13.5px] font-medium text-muted transition-colors hover:text-default no-underline"
          :class="isActiveRoute(item.to) ? 'bg-elevated text-default shadow-[0_1px_2px_rgba(31,37,71,0.06)]' : ''"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <!-- Right actions -->
      <div class="flex items-center gap-2 shrink-0">
        <template v-if="isAuthenticated">
          <PlatformButton to="/dashboard" class="hidden sm:inline-flex">
            Dashboard
            <PlatformIcon name="arrow-right" class="size-3.5" />
          </PlatformButton>
        </template>
        <template v-else>
          <PlatformButton to="/login" variant="ghost" class="hidden sm:inline-flex">
            Login
          </PlatformButton>
          <PlatformButton to="/signup" class="hidden sm:inline-flex">
            Start free
            <PlatformIcon name="arrow-right" class="size-3.5" />
          </PlatformButton>
        </template>
        <button
          type="button"
          class="flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-muted hover:text-default lg:hidden"
          aria-label="Toggle menu"
          :aria-expanded="isMobileMenuOpen"
          aria-controls="mobile-menu"
          @click="toggleMobileMenu"
        >
          <PlatformIcon :name="isMobileMenuOpen ? 'x' : 'menu'" class="size-5" />
        </button>
      </div>
    </div>

    <!-- Mobile menu -->
    <div id="mobile-menu" v-if="isMobileMenuOpen" class="lg:hidden border-t border-default bg-default">
      <nav class="px-4 py-4 space-y-2">
        <NuxtLink
          v-for="item in navItems"
          :key="item.label"
          :to="item.to"
          class="block px-4 py-3 rounded-lg text-[13.5px] font-medium text-muted hover:text-default hover:bg-muted transition-colors no-underline"
          :class="isActiveRoute(item.to) ? 'bg-muted text-default' : ''"
          @click="closeMobileMenu"
        >
          {{ item.label }}
        </NuxtLink>
        <div class="pt-4 space-y-2">
          <template v-if="isAuthenticated">
            <NuxtLink to="/dashboard" class="block px-4 py-3 text-[13.5px] font-semibold text-primary transition-colors no-underline" @click="closeMobileMenu">
              Dashboard →
            </NuxtLink>
          </template>
          <template v-else>
            <NuxtLink to="/login" class="block px-4 py-3 text-[13.5px] font-medium text-default hover:text-muted transition-colors no-underline" @click="closeMobileMenu">
              Login
            </NuxtLink>
            <NuxtLink to="/signup" class="block px-4 py-3 text-[13.5px] font-semibold text-primary transition-colors no-underline" @click="closeMobileMenu">
              Start free
            </NuxtLink>
          </template>
        </div>
      </nav>
    </div>
  </header>
</template>

<script setup lang="ts">
const { isAuthenticated } = useAuth()

const navItems = [
  { label: 'Plugin', to: '/plugin' },
  { label: 'Features', to: '/features' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Templates', to: '/templates' },
  { label: 'Docs', to: '/docs' },
  { label: 'Blog', to: '/blog' },
]

const route = useRoute()

function isActiveRoute(to: string) {
  const path = to.split('#')[0]!
  if (path === '/') return route.fullPath === to
  return route.fullPath === to || route.fullPath.startsWith(path)
}

const isMobileMenuOpen = ref(false)

function toggleMobileMenu() {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}

function closeMobileMenu() {
  isMobileMenuOpen.value = false
}

watch(() => route.fullPath, () => {
  closeMobileMenu()
})
</script>
