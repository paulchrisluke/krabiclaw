<template>
  <header class="sticky top-0 z-50 bg-default/85 backdrop-blur-md border-b border-default">
    <div class="mx-auto flex h-16 items-center justify-between gap-6 px-6" :class="containerClass">

      <!-- Wordmark. Docs and blog carry their own contextual word; there is no
           leading dot before it. -->
      <NuxtLink to="/" class="group flex shrink-0 items-center gap-2.5 no-underline">
        <img src="/platform/krabiclaw-symbol.svg" alt="KrabiClaw" width="34" height="34" class="size-8.5 rounded-lg transition-transform duration-200 group-hover:rotate-12" />
        <span class="kc-wordmark text-[19px] leading-none">
          <span class="kc-wordmark__krabi">krabi</span><span class="kc-wordmark__claw">claw</span><span v-if="sectionSuffix" class="kc-wordmark__suffix">{{ sectionSuffix }}</span><span v-else class="kc-wordmark__tld">.com</span>
        </span>
      </NuxtLink>

      <!-- Desktop nav pill -->
      <nav aria-label="Main" class="hidden items-center gap-0.5 rounded-full border border-muted bg-elevated/50 p-1 nav:flex">
        <div class="group relative">
          <button
            type="button"
            class="flex cursor-pointer items-center gap-1.5 rounded-full py-2 pl-4 pr-3.5 text-[15px] font-medium text-muted transition-colors hover:text-default"
            :class="isSolutionsActive ? 'bg-elevated text-default shadow-xs' : ''"
            aria-haspopup="true"
          >
            <span>Solutions</span>
            <PlatformIcon name="chevron-down" class="size-3.5 transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180" />
          </button>
          <div class="invisible absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3 opacity-0 transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
            <div class="flex min-w-59 flex-col gap-0.5 rounded-[14px] border border-default bg-elevated p-2 shadow-lg">
              <NuxtLink
                v-for="solution in SOLUTION_ITEMS"
                :key="solution.to"
                :to="solution.to"
                class="whitespace-nowrap rounded-lg px-3 py-2.25 text-[15px] font-medium text-muted no-underline transition-colors hover:bg-muted hover:text-default"
                :class="isActiveRoute(solution.to) ? 'bg-muted text-default' : ''"
              >
                {{ solution.label }}
              </NuxtLink>
            </div>
          </div>
        </div>

        <NuxtLink
          v-for="item in PRIMARY_ITEMS"
          :key="item.to"
          :to="item.to"
          class="rounded-full px-4 py-2 text-[15px] font-medium text-muted no-underline transition-colors hover:text-default"
          :class="isActiveRoute(item.to) ? 'bg-elevated text-default shadow-xs' : ''"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <!-- Account actions + the one shared hamburger -->
      <div class="flex shrink-0 items-center gap-2.5">
        <PlatformAccountCta account />
        <button
          ref="toggleButton"
          type="button"
          class="grid size-9.5 place-items-center rounded-lg border border-default text-default transition-colors hover:bg-muted nav:hidden"
          :aria-label="mobileOpen ? 'Close menu' : 'Open menu'"
          :aria-expanded="mobileOpen"
          aria-controls="platform-mobile-nav"
          @click="mobileOpen = !mobileOpen"
        >
          <PlatformIcon :name="mobileOpen ? 'x' : 'menu'" class="size-4.75" />
        </button>
      </div>
    </div>

    <!-- Collapsed navigation. One implementation for marketing, docs and blog. -->
    <div
      v-if="mobileOpen"
      id="platform-mobile-nav"
      class="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-default bg-default py-4.5 nav:hidden"
    >
      <nav aria-label="Site" class="mx-auto px-6" :class="containerClass">
        <PlatformCommandSearchTrigger
          :surface="searchSurface"
          :label="searchLabel"
          :aria-label="searchLabel"
          class="mb-4 rounded-lg"
          @click="close"
        />

        <div class="flex flex-col gap-0.5">
          <details class="group/dis">
            <summary class="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-3 py-2.75 text-[15px] font-medium text-muted transition-colors hover:bg-muted hover:text-default [&::-webkit-details-marker]:hidden">
              Solutions
              <PlatformIcon name="chevron-down" class="ml-auto size-4 transition-transform duration-200 group-open/dis:rotate-180" />
            </summary>
            <div class="my-1 ml-3 flex flex-col gap-0.5 border-l border-default pl-3">
              <NuxtLink
                v-for="solution in SOLUTION_ITEMS"
                :key="solution.to"
                :to="solution.to"
                class="rounded-lg px-3 py-2.25 text-[14px] text-dimmed no-underline transition-colors hover:bg-muted hover:text-default"
                @click="close"
              >
                {{ solution.label }}
              </NuxtLink>
            </div>
          </details>

          <NuxtLink
            v-for="item in COLLAPSED_LINKS"
            :key="item.to"
            :to="item.to"
            class="rounded-lg px-3 py-2.75 text-[15px] font-medium text-muted no-underline transition-colors hover:bg-muted hover:text-default"
            :class="isActiveRoute(item.to) ? 'bg-elevated text-default' : ''"
            @click="close"
          >
            {{ item.label }}
          </NuxtLink>

          <!-- Docs and Blog children come from the canonical article sources, so
               they are fetched when the menu is first opened rather than on
               every public page render. -->
          <ClientOnly>
            <Suspense>
              <PlatformMobileContentNav @navigate="close" />
              <template #fallback>
                <p class="px-3 py-2.75 text-[15px] font-medium text-dimmed">Loading Docs and Blog…</p>
              </template>
            </Suspense>
          </ClientOnly>
        </div>

        <div class="mt-4.5 flex flex-col gap-0.5 border-t border-default pt-3.5">
          <p class="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-dimmed">More</p>
          <NuxtLink
            v-for="item in MORE_ITEMS"
            :key="item.to"
            :to="item.to"
            class="rounded-lg px-3 py-2.75 text-[15px] font-medium text-muted no-underline transition-colors hover:bg-muted hover:text-default"
            :class="isActiveRoute(item.to) ? 'bg-elevated text-default' : ''"
            @click="close"
          >
            {{ item.label }}
          </NuxtLink>
          <!-- At 620px and below the header bar gives up its `Sign in` text
               link, so the collapsed navigation carries the only remaining
               route to it. -->
          <NuxtLink
            v-if="!user"
            to="/login"
            class="rounded-lg px-3 py-2.75 text-[15px] font-medium text-muted no-underline transition-colors hover:bg-muted hover:text-default nav:hidden"
            @click="close"
          >
            Sign in
          </NuxtLink>
        </div>
      </nav>
    </div>
  </header>
</template>

<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import PlatformCommandSearchTrigger from '~/components/platform/search/PlatformCommandSearchTrigger.vue'
import PlatformMobileContentNav from '~/components/platform/PlatformMobileContentNav.vue'
import type { PlatformSearchPaletteSurface } from '~/composables/usePlatformSearchPalette'

const props = withDefaults(defineProps<{ section?: 'platform' | 'docs' | 'blog' }>(), {
  section: 'platform',
})

// Route migration to /services and /mcp belongs to #939; the approved labels
// point at the destinations that work today.
const SOLUTION_ITEMS = [
  { label: 'Restaurants', to: '/restaurants' },
  { label: 'Experiences', to: '/experiences' },
  { label: 'Professional Services', to: '/legal' },
] as const

const PRIMARY_ITEMS = [
  { label: 'Features', to: '/features' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Templates', to: '/templates' },
  { label: 'Docs', to: '/docs' },
] as const

// Collapsed navigation renders Docs as a disclosure group below, so it drops
// out of the plain-link run rather than being listed a second time.
const COLLAPSED_LINKS = PRIMARY_ITEMS.filter(item => item.to !== '/docs')

const MORE_ITEMS = [
  { label: 'MCP', to: '/plugin' },
  { label: 'About', to: '/about' },
  { label: 'Help center', to: '/help' },
] as const

const route = useRoute()
// The same client-only session read as PlatformAccountCta, gated the same way
// so the server and the hydrating client agree on the signed-out link.
const session = authClient.useSession()
const mounted = ref(false)
onMounted(() => { mounted.value = true })
const user = computed(() => mounted.value ? session.value.data?.user ?? null : null)
const mobileOpen = ref(false)
const toggleButton = ref<HTMLButtonElement | null>(null)
const { acquire: acquireScrollLock, release: releaseScrollLock } = useScrollLock()

const sectionSuffix = computed(() => (props.section === 'platform' ? null : props.section))
// Docs and blog keep their own wider information architecture; the marketing
// shell uses the approved 1216px wrap.
const containerClass = computed(() => (props.section === 'platform' ? 'max-w-304' : 'max-w-450'))

const searchSurface = computed<PlatformSearchPaletteSurface>(() => (
  props.section === 'platform' ? 'public' : props.section
))
const searchLabel = computed(() => {
  if (props.section === 'docs') return 'Search docs, blog, help...'
  if (props.section === 'blog') return 'Search blog, docs, help...'
  return 'Search KrabiClaw'
})

const isSolutionsActive = computed(() => SOLUTION_ITEMS.some(solution => isActiveRoute(solution.to)))

function isActiveRoute(to: string) {
  return route.path === to || route.path.startsWith(`${to}/`)
}

function close() {
  mobileOpen.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !mobileOpen.value) return
  close()
  toggleButton.value?.focus()
}

watch(mobileOpen, (open) => {
  if (open) acquireScrollLock()
  else releaseScrollLock()
})

// A route change from anywhere (a child disclosure, the search modal, the
// browser's back button) leaves the menu closed and the page scrollable.
watch(() => route.fullPath, close)

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  releaseScrollLock()
})
</script>
