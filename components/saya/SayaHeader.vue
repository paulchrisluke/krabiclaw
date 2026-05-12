<template>
  <div>
    <!-- Branding strip for free-tier tenants -->
    <div
      v-if="!isPlatform && showBrandingStrip"
      class="border-b border-(--ui-border) bg-(--ui-bg-muted) px-4 py-2 text-center text-xs tracking-wide text-(--ui-text-muted)"
    >
      Powered by
      <a href="https://krabiclaw.com" target="_blank" rel="noopener noreferrer" class="font-semibold text-(--ui-text) hover:underline">krabiclaw.com</a>
      — restaurant sites that run themselves
    </div>

    <header class="sticky top-0 z-40 border-b border-(--ui-border) bg-(--ui-bg)/80 backdrop-blur-md">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <!-- Brand name -->
        <NuxtLink to="/" class="saya-display shrink-0 text-2xl text-(--ui-text) no-underline">
          {{ restaurantName }}
        </NuxtLink>

        <!-- Desktop nav -->
        <nav class="hidden items-center gap-1 lg:flex" aria-label="Saya navigation">
          <!-- Locations dropdown -->
          <UDropdownMenu :items="locationDropdownItems" :ui="{ content: 'min-w-64' }">
            <button class="flex items-center gap-1.5 rounded-full border border-(--ui-border) bg-(--ui-bg) px-3.5 py-2 text-sm text-(--ui-text) transition hover:border-(--ui-text-muted)">
              Locations
              <UIcon name="i-heroicons-chevron-down" class="size-3 opacity-60" />
            </button>
          </UDropdownMenu>

          <NuxtLink
            to="/about"
            class="rounded-full px-3 py-2 text-sm text-(--ui-text-muted) transition hover:bg-(--ui-bg-muted) hover:text-(--ui-text)"
          >
            Story
          </NuxtLink>
          <NuxtLink
            to="/reservations"
            class="rounded-full px-3 py-2 text-sm text-(--ui-text-muted) transition hover:bg-(--ui-bg-muted) hover:text-(--ui-text)"
          >
            Reservations
          </NuxtLink>
          <NuxtLink
            to="/contact"
            class="rounded-full px-3 py-2 text-sm text-(--ui-text-muted) transition hover:bg-(--ui-bg-muted) hover:text-(--ui-text)"
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

          <!-- Reserve CTA -->
          <UButton
            to="/reservations"
            color="neutral"
            variant="solid"
            size="sm"
            class="rounded-full !bg-(--ui-primary) !text-white hover:!opacity-90"
          >
            Reserve
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
        class="absolute inset-x-0 top-16 border-b border-(--ui-border) bg-(--ui-bg) p-4 shadow-sm lg:hidden"
      >
        <nav class="grid gap-1" aria-label="Saya mobile navigation">
          <div class="pb-2 pt-1">
            <p class="px-4 text-xs font-medium uppercase tracking-widest text-(--ui-text-muted)">Locations</p>
          </div>
          <NuxtLink
            to="/locations"
            class="rounded-full px-4 py-3 text-sm text-(--ui-text-muted) hover:bg-(--ui-bg-muted)"
            @click="mobileMenuOpen = false"
          >
            All locations
          </NuxtLink>
          <NuxtLink
            v-for="loc in locations"
            :key="loc.id"
            :to="`/locations/${loc.slug}/menu`"
            class="rounded-full px-4 py-3 text-sm text-(--ui-text) hover:bg-(--ui-bg-muted)"
            @click="mobileMenuOpen = false"
          >
            {{ loc.title }}
          </NuxtLink>
          <div class="my-1 border-t border-(--ui-border)" />
          <NuxtLink
            to="/about"
            class="rounded-full px-4 py-3 text-sm text-(--ui-text) hover:bg-(--ui-bg-muted)"
            @click="mobileMenuOpen = false"
          >
            Story
          </NuxtLink>
          <NuxtLink
            to="/reservations"
            class="rounded-full px-4 py-3 text-sm text-(--ui-text) hover:bg-(--ui-bg-muted)"
            @click="mobileMenuOpen = false"
          >
            Reservations
          </NuxtLink>
          <NuxtLink
            to="/contact"
            class="rounded-full px-4 py-3 text-sm text-(--ui-text) hover:bg-(--ui-bg-muted)"
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
const { isPlatform, siteId, site } = useTenantSite()
// Cast useI18n to any — @nuxtjs/i18n augments the types at runtime but TS
// doesn't always pick up locales/setLocale under "module: preserve"
const i18n = useI18n() as any
const mobileMenuOpen = ref(false)

const currentLocale = computed(() => i18n.locale.value as string)
const availableLocales = computed(() =>
  (i18n.locales?.value ?? []).map((l: { code: string; name: string }) => ({
    code: l.code,
    name: l.name
  }))
)
const getLocaleFlag = (code: string) =>
  ({ en: '🇺🇸', th: '🇹🇭', ja: '🇯🇵', ar: '🇸🇦' }[code] ?? '🌐')
const getCurrentLocaleFlag = () => getLocaleFlag(currentLocale.value)

const restaurantName = computed(() => (site as any)?.value?.name || (site as any)?.name || 'Saya')
const sitePlan = computed(() => (site as any)?.value?.plan || (site as any)?.plan || 'free')
const showBrandingStrip = computed(() => !isPlatform && sitePlan.value === 'free')

const { open: openUpgrade } = useUpgradeModal()

const languageItems = computed(() =>
  availableLocales.value.map((l: { code: string; name: string }) => ({
    label: `${getLocaleFlag(l.code)} ${l.name}`,
    onSelect: () => i18n.setLocale?.(l.code)
  }))
)

// No await — this is a layout component, not a page. Data arrives reactively.
const { data: locationsData } = siteId
  ? useFetch(`/api/public/sites/${siteId}/locations`, {
      key: `header-locs-${siteId}`,
      default: () => ({ locations: [] })
    })
  : { data: ref({ locations: [] }) }

const locations = computed(() => (locationsData as any).value?.locations ?? [])

const locationDropdownItems = computed(() => [
  [{
    label: 'All locations',
    to: '/locations',
    class: 'text-xs uppercase tracking-widest text-(--ui-text-muted)'
  }],
  locations.value.map((loc: any) => ({
    label: loc.title,
    to: `/locations/${loc.slug}/menu`,
    icon: 'i-heroicons-map-pin'
  }))
].filter((group: any[]) => group.length > 0))
</script>
