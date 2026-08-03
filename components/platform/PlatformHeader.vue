<template>
  <header class="sticky top-0 z-50 bg-default/85 backdrop-blur-md border-b border-default">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6 h-16">

      <!-- Wordmark -->
      <NuxtLink to="/" class="flex items-center gap-2.5 shrink-0 group">
        <img src="/krabi-claw-logo-96.webp" alt="KrabiClaw" width="36" height="36" class="w-8.5 h-8.5 rounded-[9px] group-hover:rotate-12 transition-transform duration-200" />
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
        <NuxtLink to="/login" class="hidden sm:inline-flex items-center rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-default no-underline">
          Login
        </NuxtLink>
        <NuxtLink to="/signup" class="hidden sm:inline-flex items-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 no-underline">
          Start free
        </NuxtLink>
        <details ref="mobileMenu" class="group lg:hidden">
          <summary
            class="flex size-8 cursor-pointer list-none items-center justify-center rounded-md text-muted transition-colors hover:bg-muted hover:text-default [&::-webkit-details-marker]:hidden"
            aria-label="Toggle menu"
          >
            <PlatformIcon name="menu" class="size-5 group-open:hidden" />
            <PlatformIcon name="x" class="hidden size-5 group-open:block" />
          </summary>
          <div id="mobile-menu" class="absolute inset-x-0 top-16 border-t border-default bg-default">
            <nav class="px-4 py-4 space-y-2">
              <NuxtLink
                v-for="item in navItems"
                :key="item.label"
                :to="item.to"
                @click="closeMobileMenu"
                class="block px-4 py-3 rounded-lg text-[13.5px] font-medium text-muted hover:text-default hover:bg-muted transition-colors no-underline"
                :class="isActiveRoute(item.to) ? 'bg-muted text-default' : ''"
              >
                {{ item.label }}
              </NuxtLink>
              <div class="pt-4 space-y-2">
                <NuxtLink to="/login" class="block px-4 py-3 text-[13.5px] font-medium text-default hover:text-muted transition-colors no-underline" @click="closeMobileMenu">
                  Login
                </NuxtLink>
                <NuxtLink to="/signup" class="block px-4 py-3 text-[13.5px] font-semibold text-primary transition-colors no-underline" @click="closeMobileMenu">
                  Start free
                </NuxtLink>
              </div>
            </nav>
          </div>
        </details>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
const navItems = [
  { label: 'Plugin', to: '/plugin' },
  { label: 'Features', to: '/features' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Templates', to: '/templates' },
  { label: 'Docs', to: '/docs' },
  { label: 'Blog', to: '/blog' },
]

const route = useRoute()
const mobileMenu = ref<HTMLDetailsElement | null>(null)

function closeMobileMenu() {
  if (mobileMenu.value) mobileMenu.value.open = false
}

function isActiveRoute(to: string) {
  const path = to.split('#')[0]!
  if (path === '/') return route.fullPath === to
  return route.fullPath === to || route.fullPath.startsWith(path)
}

</script>
