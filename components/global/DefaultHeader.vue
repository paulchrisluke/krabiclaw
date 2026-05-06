<template>
  <UHeader class="bg-black text-white">
    <template #left>
      <NuxtLink to="/" class="inline-flex items-center">
        <span class="text-xl font-bold tracking-tight uppercase">{{ restaurantName }}</span>
      </NuxtLink>
    </template>
    <template #center>
      <UNavigationMenu :items="restaurantNavItems" />
    </template>
    <template #right>
      <div class="flex items-center gap-4">
        <UDropdownMenu :items="languageItems">
          <UButton variant="ghost" color="neutral" size="sm" class="text-white hover:bg-white/10">
            <span>{{ getCurrentLocaleFlag() }}</span>
            <span>{{ currentLocale }}</span>
          </UButton>
        </UDropdownMenu>
        <UButton to="/reservations" color="neutral" variant="solid" class="bg-white text-black hover:bg-white/90">Reserve</UButton>
      </div>
    </template>
  </UHeader>
</template>

<script setup>
const { isPlatform, site } = await useTenantSite()
const { locale, locales, setLocale } = useI18n()

const currentLocale = computed(() => locale.value)
const availableLocales = computed(() => locales.value.map(l => ({ code: l.code, name: l.name })))

const switchLocale = (code) => { setLocale(code) }

const getLocaleFlag = (code) => {
  const flags = { 'en': '🇺🇸', 'th': '🇹🇭', 'ja': '🇯🇵', 'ar': '🇸🇦' }
  return flags[code] || '🌐'
}

const getCurrentLocaleFlag = () => getLocaleFlag(currentLocale.value)

const restaurantName = computed(() => site?.name || 'Restaurant Website')

const restaurantNavItems = [
  { label: 'Menu', to: '/menu' },
  { label: 'Location', to: '/location' },
  { label: 'Contact', to: '/contact' }
]

const languageItems = computed(() => [
  availableLocales.value.map(locale => ({
    label: `${getLocaleFlag(locale.code)} ${locale.name}`,
    onSelect: () => switchLocale(locale.code)
  }))
])
</script>
