<template>
  <div>
    <header ref="headerRef" class="sticky top-0 z-50 border-b border-default bg-default/80 backdrop-blur-md">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <!-- Brand logo / name -->
        <NuxtLink to="/" class="shrink-0 no-underline">
          <img
            v-if="logoUrl"
            :src="logoUrl"
            :alt="restaurantName"
            class="h-10 w-auto max-w-35 object-contain"
          />
          <span v-else class="saya-display text-2xl text-default">{{ restaurantName }}</span>
        </NuxtLink>

        <!-- Desktop nav -->
        <nav class="hidden items-center gap-1 lg:flex" aria-label="Saya navigation">
          <!-- Locations dropdown -->
          <UDropdownMenu :items="locationDropdownItems" :ui="{ content: 'saya-theme min-w-64' }">
            <button class="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted transition hover:bg-muted hover:text-default">
              Locations
              <UIcon name="i-heroicons-chevron-down" class="size-3 opacity-60" />
            </button>
          </UDropdownMenu>

          <NuxtLink
            to="/about"
            class="rounded-full px-3 py-2 text-sm text-muted transition hover:bg-muted hover:text-default"
          >
            Story
          </NuxtLink>
          <NuxtLink
            to="/reservations"
            class="rounded-full px-3 py-2 text-sm text-muted transition hover:bg-muted hover:text-default"
          >
            Reservations
          </NuxtLink>
          <NuxtLink
            v-if="hasExperiences"
            to="/experiences"
            class="rounded-full px-3 py-2 text-sm text-muted transition hover:bg-muted hover:text-default"
          >
            Experiences
          </NuxtLink>
          <NuxtLink
            to="/contact"
            class="rounded-full px-3 py-2 text-sm text-muted transition hover:bg-muted hover:text-default"
          >
            Contact
          </NuxtLink>
        </nav>

        <div class="flex items-center gap-2">
          <!-- Language switcher -->
          <UDropdownMenu :items="languageItems" :ui="{ content: 'saya-theme' }">
            <UButton variant="ghost" color="neutral" size="sm">
              <span>{{ getCurrentLocaleFlag() }}</span>
              <span class="hidden sm:inline">{{ currentLocale }}</span>
            </UButton>
          </UDropdownMenu>

          <!-- Dark mode toggle -->
          <UColorModeButton variant="ghost" color="neutral" size="sm" />

          <!-- Primary CTA: Order Now if delivery links exist, otherwise Reserve -->
          <UButton
            :to="hasOrderLinks ? '/order' : '/reservations'"
            color="primary"
            variant="solid"
            size="sm"
            class="rounded-full"
          >
            {{ hasOrderLinks ? 'Order Now' : 'Reserve' }}
          </UButton>

          <!-- Mobile menu toggle -->
          <UButton
            icon="i-heroicons-bars-3"
            color="neutral"
            variant="ghost"
            size="sm"
            class="lg:hidden"
            :aria-label="mobileMenuOpen ? 'Close navigation' : 'Open navigation'"
            @click="mobileMenuOpen = !mobileMenuOpen"
          />
        </div>
      </div>

      <!-- Mobile menu -->
      <div
        v-if="mobileMenuOpen"
        class="absolute inset-x-0 top-16 border-b border-default bg-default p-4 shadow-sm lg:hidden"
      >
        <nav class="grid gap-1" aria-label="Saya mobile navigation">
          <div class="pb-2 pt-1">
            <p class="px-4 text-xs font-medium uppercase tracking-widest text-muted">Locations</p>
          </div>
          <NuxtLink
            v-for="loc in locations"
            :key="loc.id"
            :to="`/locations/${loc.slug}`"
            class="rounded-full px-4 py-3 text-sm text-default hover:bg-muted"
            @click="mobileMenuOpen = false"
          >
            {{ loc.title }}
          </NuxtLink>
          <div class="my-1 border-t border-default" />
          <NuxtLink
            to="/about"
            class="rounded-full px-4 py-3 text-sm text-default hover:bg-muted"
            @click="mobileMenuOpen = false"
          >
            Story
          </NuxtLink>
          <NuxtLink
            v-if="hasOrderLinks"
            to="/order"
            class="rounded-full px-4 py-3 text-sm font-semibold text-default hover:bg-muted"
            @click="mobileMenuOpen = false"
          >
            Order Now
          </NuxtLink>
          <NuxtLink
            to="/reservations"
            class="rounded-full px-4 py-3 text-sm text-default hover:bg-muted"
            @click="mobileMenuOpen = false"
          >
            Reservations
          </NuxtLink>
          <NuxtLink
            v-if="hasExperiences"
            to="/experiences"
            class="rounded-full px-4 py-3 text-sm text-default hover:bg-muted"
            @click="mobileMenuOpen = false"
          >
            Experiences
          </NuxtLink>
          <NuxtLink
            to="/contact"
            class="rounded-full px-4 py-3 text-sm text-default hover:bg-muted"
            @click="mobileMenuOpen = false"
          >
            Contact
          </NuxtLink>
        </nav>
      </div>
    </header>
  </div>
</template>

<script setup lang="ts">
interface Site {
  brand_name?: string | null
  logo_url?: string | null
  plan?: string
}

interface I18nComposable {
  locale: Ref<string>
  locales: Ref<Array<{ code: string; name: string }>>
  setLocale: (_code: string) => void
}


const { site } = useTenantSite()
const i18n = useI18n() as ApiValue as I18nComposable
const mobileMenuOpen = ref(false)
const headerRef = ref<HTMLElement | null>(null)
let headerResizeObserver: ResizeObserver | null = null

function syncHeaderHeight() {
  if (!headerRef.value) return
  document.documentElement.style.setProperty('--saya-header-height', `${headerRef.value.getBoundingClientRect().height}px`)
}

onMounted(() => {
  syncHeaderHeight()
  headerResizeObserver = new ResizeObserver(syncHeaderHeight)
  if (headerRef.value) headerResizeObserver.observe(headerRef.value)
  window.addEventListener('resize', syncHeaderHeight)
})

onUnmounted(() => {
  headerResizeObserver?.disconnect()
  window.removeEventListener('resize', syncHeaderHeight)
})

const currentLocale = computed(() => i18n.locale.value)
const getLocaleFlag = (code: string) =>
  ({ en: '🇺🇸', th: '🇹🇭', fr: '🇫🇷', ja: '🇯🇵', 'zh-CN': '🇨🇳', ko: '🇰🇷', es: '🇪🇸', de: '🇩🇪', it: '🇮🇹', ar: '🇸🇦' }[code] ?? '🌐')
const getCurrentLocaleFlag = () => getLocaleFlag(currentLocale.value)

const restaurantName = computed(() => (site as Site | null)?.brand_name || 'Saya')
const logoUrl = computed(() => (site as Site | null)?.logo_url || null)

useUpgradeModal()

// Shared bootstrap — same key as page component + footer → single SSR request
const { locations: bootstrapLocations, locales: bootstrapLocales, hasExperiences } = useBootstrap()

const availableLocales = computed(() =>
  bootstrapLocales.value.length
    ? bootstrapLocales.value.map(l => ({ code: l.code, name: l.label || l.code }))
    : (i18n.locales?.value ?? []).map((l: { code: string; name: string }) => ({ code: l.code, name: l.name }))
)

const languageItems = computed(() =>
  availableLocales.value.map((l: { code: string; name: string }) => ({
    label: `${getLocaleFlag(l.code)} ${l.name}`,
    onSelect: () => i18n.setLocale(l.code)
  }))
)

const locations = computed(() => bootstrapLocations.value)
const hasOrderLinks = computed(() =>
  locations.value.some((loc: ApiRecord) => loc.grab_url || loc.uber_eats_url || loc.foodpanda_url)
)

const locationDropdownItems = computed(() => [
  locations.value.map((loc: { title: string; slug: string }) => ({
    label: loc.title,
    to: `/locations/${loc.slug}`,
    icon: 'i-heroicons-map-pin'
  }))
].filter((group: ApiRecord[]) => group.length > 0))
</script>
