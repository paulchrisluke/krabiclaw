<template>
  <header class="sticky top-0 z-40 border-b border-(--ui-border) bg-(--ui-bg) text-(--ui-text) backdrop-blur">
    <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
      <NuxtLink to="/" class="inline-flex min-w-0 items-center">
        <span class="truncate text-xl font-bold tracking-tight uppercase">{{ restaurantName }}</span>
      </NuxtLink>

      <nav class="hidden items-center gap-1 lg:flex" aria-label="Saya navigation">
        <NuxtLink
          v-for="link in sayaNavLinks"
          :key="link.to"
          :to="link.to"
          class="rounded-full px-3 py-2 text-sm font-medium text-(--ui-text-muted) transition hover:bg-(--ui-bg-muted) hover:text-(--ui-text)"
        >
          {{ link.label }}
        </NuxtLink>
      </nav>

      <div class="flex items-center gap-2">
        <UDropdownMenu :items="languageItems">
          <UButton variant="ghost" color="neutral" size="sm">
            <span>{{ getCurrentLocaleFlag() }}</span>
            <span>{{ currentLocale }}</span>
          </UButton>
        </UDropdownMenu>
        <UColorModeButton variant="ghost" color="neutral" size="sm" />
        <UButton to="/reservations" color="neutral" variant="solid" size="xl">Reserve</UButton>
        <UButton
          icon="i-heroicons-bars-3"
          color="neutral"
          variant="ghost"
          size="sm"
          class="lg:hidden"
          :aria-label="mobileMenuOpen ? 'Close navigation' : 'Open navigation'"
          :aria-expanded="mobileMenuOpen"
          @click="mobileMenuOpen = !mobileMenuOpen"
        />
      </div>

      <div
        v-if="mobileMenuOpen"
        class="absolute inset-x-0 top-16 border-b border-(--ui-border) bg-(--ui-bg) p-4 shadow-sm lg:hidden"
      >
        <nav class="grid gap-1" aria-label="Saya mobile navigation">
          <NuxtLink
            v-for="link in sayaNavLinks"
            :key="link.to"
            :to="link.to"
            class="rounded-full px-4 py-3 text-sm font-medium text-(--ui-text) hover:bg-(--ui-bg-muted)"
            @click="mobileMenuOpen = false"
          >
            {{ link.label }}
          </NuxtLink>
        </nav>
      </div>
    </div>
  </header>
</template>

<script setup>
import { sayaNavLinks } from '~/config/saya-theme'

const { isPlatform, site } = await useTenantSite()
const { locale, locales, setLocale } = useI18n()
const mobileMenuOpen = ref(false)

const currentLocale = computed(() => locale.value)
const availableLocales = computed(() => locales.value.map(l => ({ code: l.code, name: l.name })))

const switchLocale = (code) => { setLocale(code) }

const getLocaleFlag = (code) => {
  const flags = { 'en': '🇺🇸', 'th': '🇹🇭', 'ja': '🇯🇵', 'ar': '🇸🇦' }
  return flags[code] || '🌐'
}

const getCurrentLocaleFlag = () => getLocaleFlag(currentLocale.value)

const restaurantName = computed(() => site?.name || 'Saya Kitchen')

const languageItems = computed(() =>
  availableLocales.value.map(locale => ({
    label: `${getLocaleFlag(locale.code)} ${locale.name}`,
    onSelect: () => switchLocale(locale.code)
  }))
)
</script>
