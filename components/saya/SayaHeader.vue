<template>
  <div>
    <header ref="headerRef" class="sticky top-0 z-50 border-b border-default bg-default/80 backdrop-blur-md">
      <div class="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6 lg:px-8">
        <!-- Brand logo / name -->
        <NuxtLink to="/" class="shrink-0 no-underline">
          <div v-if="logoUrl" class="size-10 shrink-0 rounded-full overflow-hidden">
            <img :src="logoUrl" :alt="restaurantName" class="h-full w-full object-cover" />
          </div>
          <div v-else class="flex size-10 items-center justify-center rounded-full bg-(--kc-navy) text-white font-bold text-base shrink-0">
            {{ restaurantName.charAt(0).toUpperCase() }}
          </div>
        </NuxtLink>

        <!-- Desktop nav -->
        <nav class="hidden items-center gap-1 lg:flex" :aria-label="$t('saya.header.nav_aria')">
          <NuxtLink
            v-if="hasMenu"
            to="/menu"
            class="rounded-full px-3 py-2 text-sm text-muted transition hover:bg-muted hover:text-default"
          >
            {{ $t('saya.header.menu') }}
          </NuxtLink>

          <NuxtLink
            v-if="!isExperienceSite"
            to="/reservations"
            class="rounded-full px-3 py-2 text-sm text-muted transition hover:bg-muted hover:text-default"
          >
            {{ $t('saya.header.reservations') }}
          </NuxtLink>
          <NuxtLink
            v-if="hasExperiences"
            to="/experiences"
            class="rounded-full px-3 py-2 text-sm text-muted transition hover:bg-muted hover:text-default"
          >
            {{ $t('saya.header.experiences') }}
          </NuxtLink>

          <SayaDropdown v-if="locations.length > 1" :items="locationDropdownItems" panel-class="saya-theme min-w-64">
            <template #default="{ open, toggle, triggerKeydown }">
              <button
                type="button"
                class="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted transition hover:bg-muted hover:text-default"
                aria-haspopup="menu"
                :aria-expanded="open"
                @click="toggle"
                @keydown="triggerKeydown"
              >
                {{ $t('saya.header.locations') }}
                <svg viewBox="0 0 20 20" fill="currentColor" class="size-3 opacity-60"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg>
              </button>
            </template>
          </SayaDropdown>
        </nav>

        <div class="flex items-center justify-end gap-2 col-start-3">
          <!-- Primary CTA: Order Now if delivery links exist, otherwise dynamic Reserve/Book -->
          <NuxtLink
            :to="primaryCtaPath"
            class="inline-flex items-center justify-center rounded-full bg-(--brand-color) px-3.5 py-1.5 text-sm font-medium text-(--brand-color-foreground) no-underline transition hover:opacity-90"
          >
            {{ primaryCtaLabel }}
          </NuxtLink>

          <!-- Mobile menu toggle -->
          <button
            type="button"
            class="lg:hidden inline-flex size-8 items-center justify-center rounded-full text-muted transition hover:bg-muted hover:text-default"
            :aria-label="mobileMenuOpen ? $t('saya.header.close_navigation') : $t('saya.header.open_navigation')"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" class="size-5"><path fill-rule="evenodd" d="M2.75 5.75a.75.75 0 01.75-.75h13a.75.75 0 010 1.5h-13a.75.75 0 01-.75-.75zM2.75 10a.75.75 0 01.75-.75h13a.75.75 0 010 1.5h-13A.75.75 0 012.75 10zM2.75 14.25a.75.75 0 01.75-.75h13a.75.75 0 010 1.5h-13a.75.75 0 01-.75-.75z" clip-rule="evenodd" /></svg>
          </button>
        </div>
      </div>

      <!-- Mobile menu -->
      <div
        v-if="mobileMenuOpen"
        class="absolute inset-x-0 top-16 border-b border-default bg-default p-4 shadow-sm lg:hidden"
      >
        <nav class="grid gap-1" :aria-label="$t('saya.header.mobile_nav_aria')">
          <NuxtLink
            v-if="hasMenu"
            to="/menu"
            class="rounded-full px-4 py-3 text-sm font-semibold text-default hover:bg-muted"
            @click="mobileMenuOpen = false"
          >
            {{ $t('saya.header.menu') }}
          </NuxtLink>
          <template v-if="locations.length > 1">
            <div class="pb-2 pt-1">
              <p class="px-4 text-xs font-medium uppercase tracking-widest text-muted">{{ $t('saya.header.locations') }}</p>
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
          </template>
          <div class="my-1 border-t border-default" />
          <NuxtLink
            v-if="hasOrderLinks && !isExperienceSite"
            to="/order"
            class="rounded-full px-4 py-3 text-sm font-semibold text-default hover:bg-muted"
            @click="mobileMenuOpen = false"
          >
            {{ $t('saya.header.order_now') }}
          </NuxtLink>
          <NuxtLink
            v-if="!isExperienceSite"
            to="/reservations"
            class="rounded-full px-4 py-3 text-sm text-default hover:bg-muted"
            @click="mobileMenuOpen = false"
          >
            {{ $t('saya.header.reservations') }}
          </NuxtLink>
          <NuxtLink
            v-if="hasExperiences"
            to="/experiences"
            class="rounded-full px-4 py-3 text-sm text-default hover:bg-muted"
            @click="mobileMenuOpen = false"
          >
            {{ $t('saya.header.experiences') }}
          </NuxtLink>
          <NuxtLink
            to="/contact"
            class="rounded-full px-4 py-3 text-sm text-default hover:bg-muted"
            @click="mobileMenuOpen = false"
          >
            {{ $t('saya.header.contact') }}
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
  t: (_key: string, _named?: Record<string, unknown>) => string
}


import { getVerticalCopy } from '~/utils/vertical-copy'
import { DEFAULT_BUSINESS_NAME } from '~/config/constants'

const { site } = useTenantSite()
const { locale } = useI18n()
const verticalCopy = computed(() => getVerticalCopy((site as { vertical?: string } | null)?.vertical, locale.value))
const i18n = useI18n() as ApiValue as I18nComposable
const { t } = i18n
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

const restaurantName = computed(() => (site as Site | null)?.brand_name || DEFAULT_BUSINESS_NAME)
const logoUrl = computed(() => (site as Site | null)?.logo_url || null)
const isExperienceSite = computed(() => (site as { vertical?: string | null } | null)?.vertical === 'experience')

useUpgradeModal()

// Shared bootstrap — same key as page component + footer → single SSR request
const { locations: bootstrapLocations, hasExperiences, menu } = useBootstrap()

const hasMenu = computed(() => (menu.value?.items?.length ?? 0) > 0)


const locations = computed(() => bootstrapLocations.value)
const hasOrderLinks = computed(() =>
  locations.value.some((loc: ApiRecord) => loc.grab_url || loc.uber_eats_url || loc.foodpanda_url)
)

const primaryCtaPath = computed(() => {
  if (hasOrderLinks.value && !isExperienceSite.value) return '/order'
  return verticalCopy.value.ctaRoute
})

const primaryCtaLabel = computed(() => {
  if (hasOrderLinks.value && !isExperienceSite.value) return t('saya.header.order_now')
  return verticalCopy.value.reserveCta
})

const locationDropdownItems = computed(() =>
  locations.value.map((loc: { title: string; slug: string }) => ({
    label: loc.title,
    to: `/locations/${loc.slug}`,
  }))
)
</script>
