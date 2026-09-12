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
        <!-- Solutions Dropdown -->
        <div class="relative group">
          <button
            type="button"
            class="flex items-center gap-1 px-3.5 py-2 rounded-full text-[13.5px] font-medium text-muted transition-colors hover:text-default cursor-pointer"
            :class="isSolutionsActive ? 'bg-elevated text-default shadow-[0_1px_2px_rgba(31,37,71,0.06)]' : ''"
          >
            <span>Solutions</span>
            <PlatformIcon name="chevron-down" class="size-3.5 transition-transform duration-200 group-hover:rotate-180" />
          </button>
          <div class="absolute left-0 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all duration-150 z-50">
            <div class="w-60 p-1.5 rounded-2xl bg-default/95 backdrop-blur-md border border-default shadow-xl flex flex-col gap-0.5">
              <NuxtLink
                v-for="sol in solutionItems"
                :key="sol.to"
                :to="sol.to"
                class="px-3 py-2 rounded-xl text-[13px] font-medium text-muted hover:text-default hover:bg-muted transition-colors no-underline flex items-start gap-2.5"
                :class="isActiveRoute(sol.to) ? 'bg-muted text-default font-semibold' : ''"
              >
                <PlatformIcon :name="sol.icon" class="size-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <div class="leading-tight text-default font-medium">{{ sol.label }}</div>
                  <div class="text-[11px] text-muted leading-tight mt-0.5">{{ sol.desc }}</div>
                </div>
              </NuxtLink>
            </div>
          </div>
        </div>

        <NuxtLink
          v-for="item in navItems"
          :key="item.label"
          :to="item.to"
          class="px-3.5 py-2 rounded-full text-[13.5px] font-medium text-muted transition-colors hover:text-default no-underline"
          :class="isActiveRoute(item.to) ? 'bg-elevated text-default shadow-[0_1px_2px_rgba(31,37,71,0.06)]' : ''"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <!-- Right actions -->
      <div class="flex items-center gap-2 shrink-0">
        <PlatformAccountCta account />
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
              <div class="pb-2 border-b border-default/50 mb-2">
                <div class="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted">Solutions</div>
                <NuxtLink
                  v-for="sol in solutionItems"
                  :key="sol.to"
                  :to="sol.to"
                  @click="closeMobileMenu"
                  class="block px-3 py-2 rounded-lg text-[13.5px] font-medium text-muted hover:text-default hover:bg-muted transition-colors no-underline"
                  :class="isActiveRoute(sol.to) ? 'bg-muted text-default' : ''"
                >
                  <div class="font-semibold text-default flex items-center gap-2">
                    <PlatformIcon :name="sol.icon" class="size-3.5 text-primary" />
                    {{ sol.label }}
                  </div>
                  <div class="text-xs text-muted pl-5.5">{{ sol.desc }}</div>
                </NuxtLink>
              </div>

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
                <PlatformAccountCta account @click="closeMobileMenu" />
              </div>
            </nav>
          </div>
        </details>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
const solutionItems = [
  { label: 'Restaurants', to: '/restaurants', desc: 'Direct bookings & crawlable menus', icon: 'utensils' },
  { label: 'Experiences', to: '/experiences', desc: 'Tours, workshops & ticketing', icon: 'calendar' },
  { label: 'Legal & Professional', to: '/legal', desc: 'Practice areas & consultation intake', icon: 'briefcase' },
] as const

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

const isSolutionsActive = computed(() =>
  solutionItems.some(sol => route.path === sol.to || route.path.startsWith(`${sol.to}/`))
)

function closeMobileMenu() {
  if (mobileMenu.value) mobileMenu.value.open = false
}

function isActiveRoute(to: string) {
  const path = to.split('#')[0]!
  if (path === '/') return route.fullPath === to
  return route.fullPath === to || route.fullPath.startsWith(path)
}

</script>
