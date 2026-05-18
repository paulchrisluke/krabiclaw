<template>
  <div>
    <!-- Branding strip for free-tier tenants -->
    <div
      v-if="!isPlatform && showBrandingStrip"
      class="border-b border-default bg-muted px-4 py-2 text-center text-xs tracking-wide text-muted"
    >
      Powered by
      <a href="https://krabiclaw.com" target="_blank" rel="noopener noreferrer" class="font-semibold text-default hover:underline">krabiclaw.com</a>
      — restaurant sites that run themselves
    </div>

    <header class="sticky top-0 z-50 border-b border-default bg-default/80 backdrop-blur-md">
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
          <UDropdownMenu :items="locationDropdownItems" :ui="{ content: 'min-w-64' }">
            <button class="flex items-center gap-1.5 rounded-full border border-default bg-default px-3.5 py-2 text-sm text-default transition hover:border-muted">
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
            to="/contact"
            class="rounded-full px-3 py-2 text-sm text-muted transition hover:bg-muted hover:text-default"
          >
            Contact
          </NuxtLink>
        </nav>

        <div class="flex items-center gap-2">
          <!-- Language switcher -->
          <UDropdownMenu :items="languageItems">
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
            class="rounded-full px-4 py-3 text-sm font-semibold text-primary hover:bg-muted"
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

const { isPlatform, siteId, site } = useTenantSite()
const i18n = useI18n() as ApiValue as I18nComposable
const mobileMenuOpen = ref(false)

const currentLocale = computed(() => i18n.locale.value)
const availableLocales = computed(() =>
  (i18n.locales?.value ?? []).map((l: { code: string; name: string }) => ({
    code: l.code,
    name: l.name
  }))
)
const getLocaleFlag = (code: string) =>
  ({ en: '🇺🇸', th: '🇹🇭', ja: '🇯🇵', ar: '🇸🇦' }[code] ?? '🌐')
const getCurrentLocaleFlag = () => getLocaleFlag(currentLocale.value)

const restaurantName = computed(() => (site as Site | null)?.brand_name || 'Saya')
const logoUrl = computed(() => (site as Site | null)?.logo_url || null)
const sitePlan = computed(() => (site as Site | null)?.plan ?? 'free')
const showBrandingStrip = computed(() => !isPlatform && sitePlan.value === 'free')

useUpgradeModal()

const languageItems = computed(() =>
  availableLocales.value.map((l: { code: string; name: string }) => ({
    label: `${getLocaleFlag(l.code)} ${l.name}`,
    onSelect: () => i18n.setLocale(l.code)
  }))
)

// No await — this is a layout component, not a page. Data arrives reactively.
const currentSiteId = computed(() => siteId || '')

const { data: locationsData, error: locationsError, execute: loadLocations } = useFetch<{ locations: ApiRecord[] }>(
  () => `/api/public/sites/${currentSiteId.value}/locations`,
  {
    key: () => `header-locs-${currentSiteId.value || 'none'}`,
    default: () => ({ locations: [] }),
    watch: false,
    immediate: false
  }
)

watch(currentSiteId, (id: string) => {
  if (id) {
    loadLocations()
  }
}, { immediate: true })

const locations = computed(() => {
  if (locationsError.value) {
    console.error('Failed to load locations:', locationsError.value)
    return []
  }
  if (!currentSiteId.value) return []
  return locationsData.value?.locations ?? []
})

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
